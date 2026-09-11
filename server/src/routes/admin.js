/**
 * Admin API Routes
 * Authentication, review, search, bulk updates, direct replies, and Twikoo/Native import/export
 */
import { requireAdmin } from '../middleware/auth.js';
import { generateToken, hashEmail, md5Email } from '../utils/crypto.js';
import { notifyUserReply } from '../utils/email.js';
import { purgeKvCache } from '../utils/kvCache.js';
import bcrypt from 'bcryptjs';

/**
 * POST /api/admin/init
 * Initialize the first admin user
 */
export async function initAdmin(request, env) {
  const count = await env.DB.prepare('SELECT COUNT(*) as total FROM admins').first();
  if (count && count.total > 0) {
    return Response.json({ error: '管理员已存在，不能重复初始化' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求数据格式错误' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password || password.length < 6) {
    return Response.json({ error: '用户名和密码不能为空，且密码至少6位' }, { status: 400 });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await env.DB.prepare(
    'INSERT INTO admins (username, password_hash) VALUES (?, ?)'
  ).bind(username.trim(), passwordHash).run();

  return Response.json({ success: true, message: '管理员创建成功，请登录' });
}

/**
 * POST /api/admin/login
 */
export async function adminLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return Response.json({ error: '用户名和密码不能为空' }, { status: 400 });
  }

  const admin = await env.DB.prepare(
    'SELECT id, username, password_hash FROM admins WHERE username = ?'
  ).bind(username).first();

  if (!admin) {
    return Response.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    return Response.json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const token = generateToken();
  const KV = env.KV || env.mianaoinfoKV;
  if (KV) {
    await KV.put(`session:${token}`, JSON.stringify({
      adminId: admin.id,
      username: admin.username,
    }), { expirationTtl: 86400 });
  }

  return Response.json({
    success: true,
    token,
    username: admin.username,
  });
}

/**
 * POST /api/admin/logout
 */
export async function adminLogout(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const KV = env.KV || env.mianaoinfoKV;
    if (KV) {
      await KV.delete(`session:${token}`);
    }
  }
  return Response.json({ success: true });
}

/**
 * GET /api/admin/check
 */
export async function checkAdmin(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;
  return Response.json({ valid: true, username: request.adminUser?.username });
}

/**
 * GET /api/admin/comments
 * Get comments for review with fuzzy search across path, title, and content
 */
export async function getAdminComments(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const pagePath = url.searchParams.get('path');
  const search = url.searchParams.get('search') || url.searchParams.get('keyword');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const bindings = [];

  if (status !== 'all') {
    whereClause += ' AND status = ?';
    bindings.push(status);
  }

  if (pagePath) {
    whereClause += ' AND (page_path LIKE ? OR page_title LIKE ?)';
    bindings.push(`%${pagePath}%`, `%${pagePath}%`);
  }

  if (search) {
    whereClause += ' AND (page_path LIKE ? OR page_title LIKE ? OR content LIKE ? OR username LIKE ? OR email LIKE ?)';
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total FROM comments WHERE ${whereClause}`;
  const countResult = await env.DB.prepare(countQuery).bind(...bindings).first();

  const listQuery = `
    SELECT id, page_path, page_title, parent_id, username, email, website, content,
           status, is_pinned, upvotes, downvotes, ip_hash, created_at, updated_at
    FROM comments
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  const listBindings = [...bindings, limit, offset];
  const results = await env.DB.prepare(listQuery).bind(...listBindings).all();

  // Aggregate stats
  const pendingCount = await env.DB.prepare("SELECT COUNT(*) as c FROM comments WHERE status = 'pending'").first();
  const approvedCount = await env.DB.prepare("SELECT COUNT(*) as c FROM comments WHERE status = 'approved'").first();
  const rejectedCount = await env.DB.prepare("SELECT COUNT(*) as c FROM comments WHERE status = 'rejected'").first();

  return Response.json({
    comments: results.results,
    pagination: {
      page,
      limit,
      total: countResult ? countResult.total : 0,
      totalPages: Math.ceil((countResult ? countResult.total : 0) / limit),
    },
    stats: {
      pending: pendingCount ? pendingCount.c : 0,
      approved: approvedCount ? approvedCount.c : 0,
      rejected: rejectedCount ? rejectedCount.c : 0,
      total: (pendingCount?.c || 0) + (approvedCount?.c || 0) + (rejectedCount?.c || 0),
    },
  });
}

/**
 * PUT /api/admin/comments/:id
 * Update status, pin, or delete
 */
export async function updateComment(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const commentId = parseInt(pathParts[pathParts.length - 1]);

  if (isNaN(commentId)) {
    return Response.json({ error: '无效的评论 ID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { status, is_pinned, action } = body;

  const comment = await env.DB.prepare(
    'SELECT id, page_path, email, status FROM comments WHERE id = ?'
  ).bind(commentId).first();

  if (!comment) {
    return Response.json({ error: '评论不存在' }, { status: 404 });
  }

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').bind(commentId, commentId).run();
    await env.DB.prepare('DELETE FROM votes WHERE comment_id = ?').bind(commentId).run();
    await purgeKvCache(env, comment.page_path);
    return Response.json({ success: true, message: '评论已删除' });
  }

  const updates = [];
  const bindings = [];

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    updates.push('status = ?');
    bindings.push(status);

    if (status === 'approved' && comment.email) {
      const emailHash = await hashEmail(comment.email);
      await env.DB.prepare(
        'INSERT OR IGNORE INTO trusted_users (email_hash) VALUES (?)'
      ).bind(emailHash).run();
    }
  }

  if (typeof is_pinned === 'number' || typeof is_pinned === 'boolean') {
    updates.push('is_pinned = ?');
    bindings.push(is_pinned ? 1 : 0);
  }

  if (updates.length === 0) {
    return Response.json({ error: '没有需要更新的字段' }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  bindings.push(commentId);

  await env.DB.prepare(
    `UPDATE comments SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...bindings).run();

  await purgeKvCache(env, comment.page_path);

  return Response.json({ success: true, message: '评论已更新' });
}

/**
 * POST /api/admin/comments/batch
 * Batch operations: approve, reject, delete
 */
export async function batchUpdateComments(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { ids, action } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: '未选择任何评论' }, { status: 400 });
  }

  const validActions = ['approve', 'reject', 'delete'];
  if (!validActions.includes(action)) {
    return Response.json({ error: '无效的操作类型' }, { status: 400 });
  }

  const placeholders = ids.map(() => '?').join(',');

  if (action === 'delete') {
    await env.DB.prepare(`DELETE FROM comments WHERE id IN (${placeholders})`).bind(...ids).run();
    await env.DB.prepare(`DELETE FROM votes WHERE comment_id IN (${placeholders})`).bind(...ids).run();
  } else {
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await env.DB.prepare(
      `UPDATE comments SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`
    ).bind(newStatus, ...ids).run();

    if (action === 'approve') {
      const approvedComments = await env.DB.prepare(
        `SELECT DISTINCT email FROM comments WHERE id IN (${placeholders})`
      ).bind(...ids).all();

      for (const row of approvedComments.results) {
        if (row.email) {
          const emailHash = await hashEmail(row.email);
          await env.DB.prepare(
            'INSERT OR IGNORE INTO trusted_users (email_hash) VALUES (?)'
          ).bind(emailHash).run();
        }
      }
    }
  }

  await purgeKvCache(env);

  return Response.json({
    success: true,
    message: `已成功批量操作 ${ids.length} 条评论`,
  });
}

/**
 * POST /api/admin/comments/reply
 * Admin direct reply from management dashboard
 */
export async function adminReplyComment(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { parent_id, content } = body;
  if (!parent_id || !content || !content.trim()) {
    return Response.json({ error: '评论 ID 与回复内容不能为空' }, { status: 400 });
  }

  const parentComment = await env.DB.prepare(
    'SELECT id, page_path, page_title, username, email FROM comments WHERE id = ?'
  ).bind(parent_id).first();

  if (!parentComment) {
    return Response.json({ error: '目标评论不存在' }, { status: 404 });
  }

  const adminUser = request.adminUser || {};
  const adminUsername = adminUser.username || '博主';
  const adminEmail = (env.ADMIN_EMAIL || 'admin@example.com').trim();
  const adminWebsite = (env.SITE_URL || '').trim();

  const ipHash = await hashIP('127.0.0.1');
  const emailHash = await hashEmail(adminEmail);

  const insertResult = await env.DB.prepare(
    `INSERT INTO comments (page_path, page_title, parent_id, username, email, website, content, status, ip_hash, email_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`
  ).bind(
    parentComment.page_path,
    parentComment.page_title || '',
    parent_id,
    adminUsername,
    adminEmail,
    adminWebsite,
    content.trim(),
    ipHash,
    emailHash
  ).run();

  const commentId = insertResult.meta.last_row_id;

  const newReplyObj = {
    id: commentId,
    page_path: parentComment.page_path,
    page_title: parentComment.page_title,
    parent_id,
    username: adminUsername,
    email: adminEmail,
    content: content.trim(),
    status: 'approved',
  };

  await purgeKvCache(env, parentComment.page_path);

  // Send reply notification to author
  try {
    await notifyUserReply(env, newReplyObj, parentComment);
  } catch (e) {
    console.error('Failed to notify author on admin reply:', e);
  }

  return Response.json({
    success: true,
    message: '回复已成功发表',
    comment: {
      id: commentId,
      username: adminUsername,
      content: content.trim(),
      created_at: new Date().toISOString(),
    }
  });
}

/**
 * GET /api/admin/export
 */
export async function exportComments(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';

  const results = await env.DB.prepare(
    `SELECT id, page_path, page_title, parent_id, username, email, website, content,
           status, is_pinned, upvotes, downvotes, created_at
    FROM comments
    ORDER BY id ASC`
  ).all();

  if (format === 'csv') {
    const headers = ['id', 'page_path', 'page_title', 'parent_id', 'username', 'email', 'website', 'content', 'status', 'is_pinned', 'upvotes', 'downvotes', 'created_at'];
    const csvRows = [headers.join(',')];

    for (const row of results.results) {
      const values = headers.map(h => {
        const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    return new Response(csvRows.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="qingniao-comments-${Date.now()}.csv"`,
      },
    });
  }

  return Response.json({
    version: '1.0',
    export_time: new Date().toISOString(),
    total: results.results.length,
    comments: results.results,
  });
}

/**
 * POST /api/admin/import
 */
export async function importComments(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { comments, isTwikoo } = body;
  if (!Array.isArray(comments) || comments.length === 0) {
    return Response.json({ error: '评论数据为空' }, { status: 400 });
  }

  let importedCount = 0;
  const twikooIdMap = new Map();

  for (const item of comments) {
    try {
      let pagePath, pageTitle, username, email, website, content, status, createdAt, ipHash, emailHash;

      if (isTwikoo) {
        pagePath = item.url || item.href || '/';
        pageTitle = item.title || '';
        username = item.nick || '匿名';
        email = item.mail || '';
        website = item.link || '';
        content = htmlToMarkdown(item.comment || '');
        status = (item.isSpam || item.status === 'spam') ? 'rejected' : 'approved';
        createdAt = item.created ? new Date(item.created).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString();
      } else {
        pagePath = item.page_path || '/';
        pageTitle = item.page_title || '';
        username = item.username || '匿名';
        email = item.email || '';
        website = item.website || '';
        content = item.content || '';
        status = item.status || 'approved';
        createdAt = item.created_at || new Date().toISOString();
      }

      emailHash = email ? await hashEmail(email) : null;
      ipHash = await hashIP('0.0.0.0');

      let parentId = null;
      if (isTwikoo && item.rid && twikooIdMap.has(item.rid)) {
        parentId = twikooIdMap.get(item.rid);
      } else if (!isTwikoo && item.parent_id) {
        parentId = item.parent_id;
      }

      const res = await env.DB.prepare(
        `INSERT INTO comments (page_path, page_title, parent_id, username, email, website, content, status, is_pinned, upvotes, downvotes, ip_hash, email_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        pagePath, pageTitle, parentId, username, email, website, content,
        status, item.is_pinned ? 1 : 0, item.upvotes || 0, item.downvotes || 0,
        ipHash, emailHash, createdAt
      ).run();

      if (isTwikoo && item._id) {
        twikooIdMap.set(item._id, res.meta.last_row_id);
      }

      importedCount++;
    } catch (err) {
      console.error('Failed to import row:', err);
    }
  }

  await purgeKvCache(env);

  return Response.json({
    success: true,
    message: `成功导入 ${importedCount} / ${comments.length} 条评论`,
    imported: importedCount,
    total: comments.length,
  });
}

function htmlToMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<del>(.*?)<\/del>/gi, '~~$1~~')
    .replace(/<code class=".*?">(.*?)<\/code>/gi, '`$1`')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (m, c) => '> ' + c.trim().replace(/\n/g, '\n> '))
    .replace(/<[^>]+>/g, '')
    .trim();
}
