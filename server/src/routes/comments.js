/**
 * Comments API routes
 * Handles CRUD operations for comments on mianao.info
 */
import { verifyCaptcha } from '../middleware/captcha.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { checkSpam, validateUsername, validateEmail } from '../utils/spam.js';
import { hashIP, hashEmail, md5Email, generateCaptchaSignature } from '../utils/crypto.js';
import { notifyAdminNewComment, notifyUserReply } from '../utils/email.js';
import { getFromKv, saveToKv, purgeKvCache } from '../utils/kvCache.js';

/**
 * GET /api/comments?path=xxx&page=1&limit=20&sort=newest
 * Get approved comments for a page with pagination and sorting
 */
export async function getComments(request, env) {
  const url = new URL(request.url);
  const pagePath = url.searchParams.get('path');

  if (!pagePath) {
    return Response.json({ error: '缺少页面路径参数' }, { status: 400 });
  }

  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
  const sort = url.searchParams.get('sort') || 'newest'; // newest, oldest, most_upvoted
  const offset = (page - 1) * limit;

  // Try KV Cache first (ultra-fast 10ms response)
  const cacheKey = `kv_comments:${pagePath}:${page}:${limit}:${sort}`;
  const cachedData = await getFromKv(env, cacheKey);
  if (cachedData) {
    return Response.json(cachedData);
  }

  let orderBy;
  switch (sort) {
    case 'oldest':
      orderBy = 'created_at ASC';
      break;
    case 'most_upvoted':
      orderBy = 'upvotes DESC, created_at DESC';
      break;
    case 'newest':
    default:
      orderBy = 'created_at DESC';
      break;
  }

  // Get total count of top-level comments
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM comments WHERE page_path = ? AND status = ? AND parent_id IS NULL'
  ).bind(pagePath, 'approved').first();

  // Get top-level comments (pinned first, then sorted)
  const comments = await env.DB.prepare(
    `SELECT id, page_path, parent_id, username, email, website, content, is_pinned, upvotes, downvotes, created_at
     FROM comments
     WHERE page_path = ? AND status = ? AND parent_id IS NULL
     ORDER BY is_pinned DESC, ${orderBy}
     LIMIT ? OFFSET ?`
  ).bind(pagePath, 'approved', limit, offset).all();

  // Get all replies for these comments
  let allReplies = [];
  if (comments.results.length > 0) {
    const replies = await env.DB.prepare(
      `SELECT id, page_path, parent_id, username, email, website, content, is_pinned, upvotes, downvotes, created_at
       FROM comments
       WHERE page_path = ? AND status = ? AND parent_id IS NOT NULL
       ORDER BY created_at ASC`
    ).bind(pagePath, 'approved').all();
    allReplies = replies.results;
  }

  // Build comment tree
  const adminEmail = (env.ADMIN_EMAIL || 'harry@mianao.info').trim().toLowerCase();
  const commentTree = buildCommentTree(comments.results, allReplies, adminEmail);

  const resultObj = {
    comments: commentTree,
    pagination: {
      page,
      limit,
      total: countResult.total,
      totalPages: Math.ceil(countResult.total / limit),
    },
    sort,
  };

  // Save to KV in background (expires in 10 mins)
  await saveToKv(env, cacheKey, resultObj, 600);

  return Response.json(resultObj);
}

/**
 * Build nested comment tree from flat list
 */
function buildCommentTree(topLevel, replies, adminEmail = 'harry@mianao.info') {
  const replyMap = new Map();

  // Group replies by parent_id
  for (const reply of replies) {
    if (!replyMap.has(reply.parent_id)) {
      replyMap.set(reply.parent_id, []);
    }
    replyMap.get(reply.parent_id).push(reply);
  }

  // Recursively attach replies
  function attachReplies(comment) {
    const children = replyMap.get(comment.id) || [];
    const { email, ...rest } = comment;
    const is_admin = email && email.trim().toLowerCase() === adminEmail ? 1 : 0;
    return {
      ...rest,
      is_admin,
      email_hash: email ? md5Email(email) : '',
      replies: children.map(child => attachReplies(child)),
    };
  }

  return topLevel.map(comment => attachReplies(comment));
}

/**
 * POST /api/comments
 * Create a new comment
 */
export async function createComment(request, env, ctx) {
  // Verify Captcha
  const captchaError = await verifyCaptcha(request, env);
  if (captchaError) return captchaError;

  // Rate limit
  const rateLimitError = await rateLimit(request, env, { maxRequests: 3, windowSeconds: 60 });
  if (rateLimitError) return rateLimitError;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { path: pagePath, pageTitle, parentId, username, email, website, content } = body;

  // Validate page path
  if (!pagePath || typeof pagePath !== 'string') {
    return Response.json({ error: '无效的页面路径' }, { status: 400 });
  }

  // Validate comment length
  if (!content || content.trim().length === 0) {
    return Response.json({ error: '请输入评论内容' }, { status: 400 });
  }
  if (content.trim().length > 500) {
    return Response.json({ error: '评论内容不能超过500字' }, { status: 400 });
  }

  // Validate username
  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) {
    return Response.json({ error: usernameCheck.reason }, { status: 400 });
  }

  // Validate email
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return Response.json({ error: emailCheck.reason }, { status: 400 });
  }

  // Validate website (optional)
  let cleanWebsite = (website || '').trim();
  if (cleanWebsite.length > 0) {
    if (cleanWebsite.length > 200) {
      return Response.json({ error: '网站地址过长' }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(cleanWebsite) && !/^\/\//.test(cleanWebsite)) {
      cleanWebsite = 'https://' + cleanWebsite;
    }
  }

  // Check spam
  const spamCheck = checkSpam(content);
  if (spamCheck.isSpam) {
    return Response.json({ error: spamCheck.reason }, { status: 400 });
  }

  // If parentId provided, verify parent exists and belongs to same page
  if (parentId) {
    const parent = await env.DB.prepare(
      'SELECT id, page_path FROM comments WHERE id = ? AND status = ?'
    ).bind(parseInt(parentId), 'approved').first();

    if (!parent) {
      return Response.json({ error: '回复的评论不存在' }, { status: 404 });
    }
    if (parent.page_path !== pagePath) {
      return Response.json({ error: '不能跨页面回复评论' }, { status: 400 });
    }
  }

  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await hashIP(ip);
  const emailH = await hashEmail(email.trim().toLowerCase());

  // Check if this user is trusted (previously approved)
  const trusted = await env.DB.prepare(
    'SELECT id FROM trusted_users WHERE email_hash = ?'
  ).bind(emailH).first();

  const status = trusted ? 'approved' : 'pending';
  const cleanTitle = (pageTitle || '').trim();

  const result = await env.DB.prepare(
    `INSERT INTO comments (page_path, page_title, parent_id, username, email, website, content, status, ip_hash, email_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    pagePath,
    cleanTitle,
    parentId ? parseInt(parentId) : null,
    username.trim(),
    email.trim().toLowerCase(),
    cleanWebsite,
    content.trim(),
    status,
    ipHash,
    emailH
  ).run();

  const commentId = result.meta.last_row_id;
  const newCommentObj = {
    id: commentId,
    page_path: pagePath,
    page_title: cleanTitle,
    parent_id: parentId ? parseInt(parentId) : null,
    username: username.trim(),
    email: email.trim().toLowerCase(),
    content: content.trim(),
    status
  };

  // Asynchronously trigger email notifications
  const sendEmails = async () => {
    await notifyAdminNewComment(env, newCommentObj);
    if (status === 'approved' && parentId) {
      const parent = await env.DB.prepare('SELECT id, page_path, page_title, username, email, content FROM comments WHERE id = ?').bind(parseInt(parentId)).first();
      if (parent) {
        await notifyUserReply(env, newCommentObj, parent);
      }
    }
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(sendEmails());
  } else {
    sendEmails().catch(e => console.error('[Email Task Error]', e));
  }

  // Clear KV Cache so new comments/recent comments refresh immediately
  await purgeKvCache(env, pagePath);

  const message = trusted
    ? '评论已发布'
    : '评论已提交，审核通过后将显示';

  return Response.json({
    success: true,
    message,
    commentId,
    status,
  }, { status: 201 });
}

/**
 * GET /api/count?paths=path1,path2,...
 * Get comment counts for multiple pages (batch)
 */
export async function getCommentCount(request, env) {
  const url = new URL(request.url);
  const pathsParam = url.searchParams.get('paths');

  if (!pathsParam) {
    return Response.json({ error: '缺少 paths 参数' }, { status: 400 });
  }

  const paths = pathsParam.split(',').filter(p => p.trim()).slice(0, 50); // max 50 paths

  if (paths.length === 0) {
    return Response.json({ counts: {} });
  }

  const placeholders = paths.map(() => '?').join(',');
  const results = await env.DB.prepare(
    `SELECT page_path, COUNT(*) as count
     FROM comments
     WHERE page_path IN (${placeholders}) AND status = 'approved' AND parent_id IS NULL
     GROUP BY page_path`
  ).bind(...paths).all();

  const counts = {};
  for (const path of paths) {
    counts[path] = 0;
  }
  for (const row of results.results) {
    counts[row.page_path] = row.count;
  }

  return Response.json({ counts });
}

/**
 * GET /api/recent?limit=6
 * Get recent comments across all pages (for sidebar widget)
 */
export async function getRecentComments(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '6'), 20);

  // Try KV Cache first
  const cacheKey = `kv_recent:${limit}`;
  const cachedData = await getFromKv(env, cacheKey);
  if (cachedData) {
    return Response.json(cachedData);
  }

  const results = await env.DB.prepare(
    `SELECT id, page_path, page_title, username, email, content, created_at
     FROM comments
     WHERE status = 'approved'
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(limit).all();

  // Compute Gravatar-compatible MD5 hash for each comment
  const comments = results.results.map(c => ({
    id: c.id,
    page_path: c.page_path,
    page_title: c.page_title,
    username: c.username,
    email_hash: c.email ? md5Email(c.email) : '',
    content: c.content,
    created_at: c.created_at,
  }));

  const resultObj = { comments };

  // Save to KV in background (expires in 10 mins)
  await saveToKv(env, cacheKey, resultObj, 600);

  return Response.json(resultObj);
}

/**
 * GET /api/captcha
 * Generate a new mathematical captcha challenge
 */
export async function getCaptcha(request, env) {
  // Generate random simple math question
  const isAddition = Math.random() > 0.5;
  let num1, num2, answer, question;

  if (isAddition) {
    num1 = Math.floor(Math.random() * 15) + 1; // 1 to 15
    num2 = Math.floor(Math.random() * 9) + 1;  // 1 to 9
    answer = num1 + num2;
    question = `${num1} + ${num2} = ?`;
  } else {
    num1 = Math.floor(Math.random() * 15) + 10; // 10 to 24
    num2 = Math.floor(Math.random() * 9) + 1;   // 1 to 9
    answer = num1 - num2;
    question = `${num1} - ${num2} = ?`;
  }

  const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes from now
  const secret = env.CAPTCHA_SECRET || 'mianao-captcha-secret-salt-2026';
  const signature = await generateCaptchaSignature(answer, expiry, secret);
  const token = `${expiry}.${signature}`;

  return Response.json({
    question,
    token
  });
}
