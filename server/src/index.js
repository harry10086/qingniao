/**
 * Qingniao (青鸟) Comment System - Cloudflare Workers Backend
 * Main entry point: routing, CORS handling, and Edge Cache optimization
 */
import { Router } from 'itty-router';
import { getComments, createComment, getCaptcha, getCommentCount, getRecentComments } from './routes/comments.js';
import { voteComment, getVoteStatus } from './routes/votes.js';
import {
  adminLogin, adminLogout, getAdminComments, updateComment,
  batchUpdateComments, exportComments, importComments, initAdmin, checkAdmin,
  adminReplyComment
} from './routes/admin.js';

const router = Router();

/**
 * Helper to generate CORS headers dynamically
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const configuredOrigin = env.CORS_ORIGIN || '*';
  let allowedOrigin = configuredOrigin;

  if (configuredOrigin === '*') {
    allowedOrigin = origin || '*';
  } else if (origin) {
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    const origins = configuredOrigin.split(',').map(s => s.trim());
    if (isLocalhost || origins.includes(origin)) {
      allowedOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true'
  };
}

/**
 * Wrap Response with CORS headers and Edge Cache headers
 */
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
    if (path === '/api/comments' || path === '/api/recent' || path === '/api/count') {
      // s-maxage=120: Cloudflare Edge caches for 2 minutes (serves in 10-30ms)
      // stale-while-revalidate=300: Revalidate in background
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

// ============ Public APIs ============

// Get a new math captcha challenge
router.get('/api/captcha', async (request, env) => {
  const response = await getCaptcha(request, env);
  return withCors(request, response, env);
});

// Get comments for a specific page path
router.get('/api/comments', async (request, env) => {
  const response = await getComments(request, env);
  return withCors(request, response, env);
});

// Get batch comment counts for multiple page paths
router.get('/api/count', async (request, env) => {
  const response = await getCommentCount(request, env);
  return withCors(request, response, env);
});

// Get recent comments across the whole site
router.get('/api/recent', async (request, env) => {
  const response = await getRecentComments(request, env);
  return withCors(request, response, env);
});

// Post a new comment
router.post('/api/comments', async (request, env, ctx) => {
  const response = await createComment(request, env, ctx);
  return withCors(request, response, env);
});

// Vote on a comment (upvote / downvote)
router.post('/api/comments/:id/vote', async (request, env) => {
  const response = await voteComment(request, env);
  return withCors(request, response, env);
});

// Get user vote status on a comment
router.get('/api/comments/:id/vote', async (request, env) => {
  const response = await getVoteStatus(request, env);
  return withCors(request, response, env);
});

// ============ Admin APIs ============

// Admin initialization (only callable when admins table is empty)
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

// Admin session validation
router.get('/api/admin/check', async (request, env) => {
  const response = await checkAdmin(request, env);
  return withCors(request, response, env);
});

// Get comments for admin review (with filters & search)
router.get('/api/admin/comments', async (request, env) => {
  const response = await getAdminComments(request, env);
  return withCors(request, response, env);
});

// Update a single comment (approve, reject, pin, unpin, delete)
router.put('/api/admin/comments/:id', async (request, env) => {
  const response = await updateComment(request, env);
  return withCors(request, response, env);
});

// Batch update comments
router.post('/api/admin/comments/batch', async (request, env) => {
  const response = await batchUpdateComments(request, env);
  return withCors(request, response, env);
});

// Export comments as JSON or CSV
router.get('/api/admin/export', async (request, env) => {
  const response = await exportComments(request, env);
  return withCors(request, response, env);
});

// Import comments (supports Qingniao native and Twikoo JSON format)
router.post('/api/admin/import', async (request, env) => {
  const response = await importComments(request, env);
  return withCors(request, response, env);
});

// Direct admin reply from dashboard
router.post('/api/admin/comments/reply', async (request, env) => {
  const response = await adminReplyComment(request, env);
  return withCors(request, response, env);
});

// ============ Fallback ============
router.all('*', () => {
  return Response.json({ error: 'Endpoint Not Found' }, { status: 404 });
});

export default {
  async fetch(request, env, ctx) {
    try {
      return await router.fetch(request, env, ctx);
    } catch (err) {
      console.error('Worker runtime error:', err);
      return withCors(
        request,
        Response.json({ error: 'Internal Server Error' }, { status: 500 }),
        env
      );
    }
  },
};
