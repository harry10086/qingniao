/**
 * Comments API Routes
 * Handles CRUD operations, tree construction, math captcha, counts, and recent lists
 */
import { verifyCaptcha } from '../middleware/captcha.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { checkSpam, validateUsername, validateEmail } from '../utils/spam.js';
import { hashIP, hashEmail, md5Email, generateCaptchaSignature } from '../utils/crypto.js';
import { notifyAdminNewComment, notifyUserReply } from '../utils/email.js';
import { getFromKv, saveToKv, purgeKvCache } from '../utils/kvCache.js';

/**
 * GET /api/comments?path=xxx&page=1&limit=20&sort=newest
 * Get approved comments for a page with nested tree and pagination
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

  // Try KV Cache first
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
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const commentTree = buildCommentTree(comments.results, allReplies, adminEmail);

  const resultObj = {
    comments: commentTree,
    pagination: {
      page,
      limit,
      total: countResult ? countResult.total : 0,
      totalPages: Math.ceil((countResult ? countResult.total : 0) / limit),
    },
    sort,
  };

  // Cache in KV for 10 minutes
  await saveToKv(env, cacheKey, resultObj, 600);

  return Response.json(resultObj);
}

/**
 * Build nested comment tree from flat lists
 */
function buildCommentTree(topLevel, replies, adminEmail = '') {
  const replyMap = new Map();

  for (const reply of replies) {
    if (!replyMap.has(reply.parent_id)) {
      replyMap.set(reply.parent_id, []);
    }
    const cleanEmail = (reply.email || '').trim().toLowerCase();
    const isAuthor = Boolean(adminEmail && cleanEmail === adminEmail);

    replyMap.get(reply.parent_id).push({
      id: reply.id,
      parent_id: reply.parent_id,
      username: reply.username,
      website: reply.website || '',
      content: reply.content,
      is_pinned: reply.is_pinned === 1,
      is_admin: isAuthor ? 1 : 0,
      upvotes: reply.upvotes,
      downvotes: reply.downvotes,
      email_hash: md5Email(reply.email),
      created_at: reply.created_at,
      replies: [],
    });
  }

  function attachReplies(comment) {
    const directReplies = replyMap.get(comment.id) || [];
    comment.replies = directReplies.map(r => attachReplies(r));
    return comment;
  }

  return topLevel.map(comment => {
    const cleanEmail = (comment.email || '').trim().toLowerCase();
    const isAuthor = Boolean(adminEmail && cleanEmail === adminEmail);

    const node = {
      id: comment.id,
      parent_id: null,
      username: comment.username,
      website: comment.website || '',
      content: comment.content,
      is_pinned: comment.is_pinned === 1,
      is_admin: isAuthor ? 1 : 0,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      email_hash: md5Email(comment.email),
      created_at: comment.created_at,
      replies: [],
    };
    return attachReplies(node);
  });
}

/**
 * POST /api/comments
 * Post a new comment
 */
export async function createComment(request, env, ctx) {
  // Rate limit check (max 3 comments per 60s per IP)
  const rateLimitError = await rateLimit(request, env, { maxRequests: 3, windowSeconds: 60 });
  if (rateLimitError) return rateLimitError;

  // Math captcha verification
  const captchaError = await verifyCaptcha(request, env);
  if (captchaError) return captchaError;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求数据格式错误' }, { status: 400 });
  }

  const { page_path, page_title, parent_id, username, email, website, content } = body;

  if (!page_path || typeof page_path !== 'string') {
    return Response.json({ error: '缺少页面路径' }, { status: 400 });
  }

  // Username validation
  const userCheck = validateUsername(username);
  if (!userCheck.valid) {
    return Response.json({ error: userCheck.reason }, { status: 400 });
  }

  // Email validation
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return Response.json({ error: emailCheck.reason }, { status: 400 });
  }

  // Content spam check
  const spamCheck = checkSpam(content);
  if (spamCheck.isSpam) {
    return Response.json({ error: spamCheck.reason }, { status: 400 });
  }

  // Check parent_id if replying
  let parentComment = null;
  if (parent_id) {
    parentComment = await env.DB.prepare(
      'SELECT id, email, username, content FROM comments WHERE id = ? AND status = ?'
    ).bind(parent_id, 'approved').first();

    if (!parentComment) {
      return Response.json({ error: '回复的评论不存在或未通过审核' }, { status: 404 });
    }
  }

  // Hash IP & email for privacy and trust tracking
  const clientIP = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await hashIP(clientIP);
  const emailHash = await hashEmail(email);

  // Check if trusted user or admin
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const isAdminUser = Boolean(adminEmail && email.trim().toLowerCase() === adminEmail);

  let initialStatus = 'pending';
  if (isAdminUser) {
    initialStatus = 'approved';
  } else {
    const trusted = await env.DB.prepare(
      'SELECT id FROM trusted_users WHERE email_hash = ?'
    ).bind(emailHash).first();
    if (trusted) {
      initialStatus = 'approved';
    }
  }

  // Clean website URL
  let cleanWebsite = (website || '').trim();
  if (cleanWebsite && !cleanWebsite.startsWith('http://') && !cleanWebsite.startsWith('https://')) {
    cleanWebsite = 'https://' + cleanWebsite;
  }

  // Insert comment
  const insertResult = await env.DB.prepare(
    `INSERT INTO comments (page_path, page_title, parent_id, username, email, website, content, status, ip_hash, email_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    page_path.trim(),
    (page_title || '').trim(),
    parent_id || null,
    username.trim(),
    email.trim().toLowerCase(),
    cleanWebsite,
    content.trim(),
    initialStatus,
    ipHash,
    emailHash
  ).run();

  const commentId = insertResult.meta.last_row_id;

  const newCommentObj = {
    id: commentId,
    page_path: page_path.trim(),
    page_title: (page_title || '').trim(),
    parent_id: parent_id || null,
    username: username.trim(),
    email: email.trim().toLowerCase(),
    website: cleanWebsite,
    content: content.trim(),
    status: initialStatus,
  };

  // Invalidate KV cache
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(purgeKvCache(env, page_path));
  } else {
    await purgeKvCache(env, page_path);
  }

  // Asynchronous email notification
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil((async () => {
      await notifyAdminNewComment(env, newCommentObj);
      if (parentComment) {
        await notifyUserReply(env, newCommentObj, parentComment);
      }
    })());
  } else {
    notifyAdminNewComment(env, newCommentObj).catch(console.error);
    if (parentComment) {
      notifyUserReply(env, newCommentObj, parentComment).catch(console.error);
    }
  }

  return Response.json({
    success: true,
    message: initialStatus === 'approved' ? '评论发表成功' : '评论已提交，博主审核后即可展示',
    comment: {
      id: commentId,
      username: username.trim(),
      content: content.trim(),
      status: initialStatus,
      email_hash: md5Email(email),
      created_at: new Date().toISOString(),
    },
  }, { status: 201 });
}

/**
 * GET /api/captcha
 * Generate a lightweight math captcha challenge
 */
export async function getCaptcha(request, env) {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1, num2, answer;

  switch (op) {
    case '+':
      num1 = Math.floor(Math.random() * 20) + 1;
      num2 = Math.floor(Math.random() * 20) + 1;
      answer = num1 + num2;
      break;
    case '-':
      num1 = Math.floor(Math.random() * 20) + 10;
      num2 = Math.floor(Math.random() * num1) + 1;
      answer = num1 - num2;
      break;
    case '×':
      num1 = Math.floor(Math.random() * 9) + 1;
      num2 = Math.floor(Math.random() * 9) + 1;
      answer = num1 * num2;
      break;
  }

  const question = `${num1} ${op} ${num2} = ?`;
  const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes valid
  const secret = env.CAPTCHA_SECRET || 'qingniao-captcha-default-secret';
  const signature = await generateCaptchaSignature(String(answer), String(expiry), secret);
  const token = `${expiry}.${signature}`;

  return Response.json({ question, token });
}

/**
 * GET /api/count?paths=/post-1,/post-2
 * Batch get comment counts for multiple paths
 */
export async function getCommentCount(request, env) {
  const url = new URL(request.url);
  const pathsParam = url.searchParams.get('paths');

  if (!pathsParam) {
    return Response.json({ error: '缺少 paths 参数' }, { status: 400 });
  }

  const paths = pathsParam.split(',').map(p => p.trim()).filter(Boolean);
  if (paths.length === 0) {
    return Response.json({ counts: {} });
  }

  const placeholders = paths.map(() => '?').join(',');
  const query = `
    SELECT page_path, COUNT(*) as count
    FROM comments
    WHERE page_path IN (${placeholders}) AND status = 'approved'
    GROUP BY page_path
  `;

  const results = await env.DB.prepare(query).bind(...paths).all();
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
 * Get recent approved comments across the entire site
 */
export async function getRecentComments(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '6'), 20);

  const cacheKey = `kv_recent:${limit}`;
  const cachedData = await getFromKv(env, cacheKey);
  if (cachedData) {
    return Response.json(cachedData);
  }

  const results = await env.DB.prepare(
    `SELECT id, page_path, page_title, username, email, website, content, created_at
     FROM comments
     WHERE status = 'approved'
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(limit).all();

  const comments = results.results.map(c => ({
    id: c.id,
    page_path: c.page_path,
    page_title: c.page_title,
    username: c.username,
    website: c.website,
    content: c.content,
    email_hash: md5Email(c.email),
    created_at: c.created_at,
  }));

  const data = { comments };
  await saveToKv(env, cacheKey, data, 120);

  return Response.json(data);
}
