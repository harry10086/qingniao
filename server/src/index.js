/**
 * Qingniao (青鸟) Workers Backend
 * Cloudflare Workers + D1 Database
 */
import { Router } from 'itty-router';
import { getComments, createComment, getCaptcha, getCommentCount, getRecentComments } from './routes/comments.js';
import { voteComment, getVoteStatus } from './routes/votes.js';
import {
  adminLogin, adminLogout, getAdminComments, updateComment,
  batchUpdateComments, exportComments, importComments, initAdmin, checkAdmin,
  adminReplyComment, getSpamRules, addBlockedKeywords, deleteBlockedKeyword,
  addBlockedIp, deleteBlockedIp, blockCommentIp
} from './routes/admin.js';

const router = Router();

/**
 * CORS headers helper
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  let allowedOrigin = env.CORS_ORIGIN || '*';

  if (origin && allowedOrigin !== '*') {
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    const configuredOrigins = allowedOrigin.split(',').map(o => o.trim());
    if (isLocalhost || configuredOrigins.includes(origin)) {
      allowedOrigin = origin;
    }
  } else if (allowedOrigin === '*' && origin) {
    allowedOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function withCors(request, response, env) {
  const newHeaders = new Headers(response.headers);
  const headers = corsHeaders(request, env);
  for (const [key, value] of Object.entries(headers)) {
    newHeaders.set(key, value);
  }

  // Edge cache optimization for public GET read APIs
  if (request.method === 'GET' && response.status === 200) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/comments' || path === '/api/recent' || path === '/api/comments/count') {
      // max-age=0: Browser always validates with Cloudflare Edge
      // s-maxage=120: Cloudflare Edge caches for 2 minutes (serves in 10-30ms)
      // stale-while-revalidate=300: Revalidate asynchronously in background
      newHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=300');
      newHeaders.set('X-Cache-Status', 'Edge-Optimized');
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// CORS preflight
router.options('*', (request, env) => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
});

// ============ Public API ============

// Get a new captcha challenge
router.get('/api/captcha', async (request, env) => {
  const response = await getCaptcha(request, env);
  return withCors(request, response, env);
});

// Get comments for a page
router.get('/api/comments', async (request, env) => {
  const response = await getComments(request, env);
  return withCors(request, response, env);
});

// Get comment counts for multiple pages (batch)
router.get('/api/count', async (request, env) => {
  const response = await getCommentCount(request, env);
  return withCors(request, response, env);
});

// Get recent comments across all pages
router.get('/api/recent', async (request, env) => {
  const response = await getRecentComments(request, env);
  return withCors(request, response, env);
});

// Post a new comment
router.post('/api/comments', async (request, env, ctx) => {
  const response = await createComment(request, env, ctx);
  return withCors(request, response, env);
});

// Vote on a comment
router.post('/api/comments/:id/vote', async (request, env) => {
  const response = await voteComment(request, env);
  return withCors(request, response, env);
});

// Get vote status
router.get('/api/comments/:id/vote', async (request, env) => {
  const response = await getVoteStatus(request, env);
  return withCors(request, response, env);
});

// ============ Admin API ============

// Admin initialization (only works when no admin exists)
router.post('/api/admin/init', async (request, env) => {
  const response = await initAdmin(request, env);
  return withCors(request, response, env);
});

// Admin login
router.post('/api/admin/login', async (request, env) => {
  const response = await adminLogin(request, env);
  return withCors(request, response, env);
});

// Admin logout
router.post('/api/admin/logout', async (request, env) => {
  const response = await adminLogout(request, env);
  return withCors(request, response, env);
});

// Admin session check
router.get('/api/admin/check', async (request, env) => {
  const response = await checkAdmin(request, env);
  return withCors(request, response, env);
});

// Get comments for admin review
router.get('/api/admin/comments', async (request, env) => {
  const response = await getAdminComments(request, env);
  return withCors(request, response, env);
});

// Update a single comment (status, pin)
router.put('/api/admin/comments/:id', async (request, env) => {
  const response = await updateComment(request, env);
  return withCors(request, response, env);
});

// Batch update comments
router.post('/api/admin/comments/batch', async (request, env) => {
  const response = await batchUpdateComments(request, env);
  return withCors(request, response, env);
});

// Export comments
router.get('/api/admin/export', async (request, env) => {
  const response = await exportComments(request, env);
  return withCors(request, response, env);
});

// Import comments
router.post('/api/admin/import', async (request, env) => {
  const response = await importComments(request, env);
  return withCors(request, response, env);
});

// Direct admin reply to comment
router.post('/api/admin/comments/reply', async (request, env) => {
  const response = await adminReplyComment(request, env);
  return withCors(request, response, env);
});

// Spam Rules & Blacklist
router.get('/api/admin/spam/rules', async (request, env) => {
  const response = await getSpamRules(request, env);
  return withCors(request, response, env);
});

router.post('/api/admin/spam/keywords', async (request, env) => {
  const response = await addBlockedKeywords(request, env);
  return withCors(request, response, env);
});

router.delete('/api/admin/spam/keywords/:id', async (request, env) => {
  const response = await deleteBlockedKeyword(request, env);
  return withCors(request, response, env);
});

router.post('/api/admin/spam/ips', async (request, env) => {
  const response = await addBlockedIp(request, env);
  return withCors(request, response, env);
});

router.delete('/api/admin/spam/ips/:id', async (request, env) => {
  const response = await deleteBlockedIp(request, env);
  return withCors(request, response, env);
});

router.post('/api/admin/spam/block-comment-ip', async (request, env) => {
  const response = await blockCommentIp(request, env);
  return withCors(request, response, env);
});

// ============ Fallback ============

router.all('*', () => {
  return Response.json({ error: 'Not Found' }, { status: 404 });
});

// Worker entry point
export default {
  async fetch(request, env, ctx) {
    try {
      return await router.fetch(request, env, ctx);
    } catch (err) {
      console.error('Worker error:', err);
      return withCors(
        request,
        Response.json({ error: '服务器内部错误' }, { status: 500 }),
        env
      );
    }
  },
};
