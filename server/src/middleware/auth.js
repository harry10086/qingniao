/**
 * Admin authentication middleware
 * Validates session token from Authorization header against KV store
 */
export async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未登录，请先登录管理后台' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.substring(7);
  const KV = env.mianaoinfoKV || env.KV;
  const session = await KV.get(`session:${token}`, { type: 'json' });

  if (!session) {
    return new Response(JSON.stringify({ error: '登录已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Attach admin info to request for downstream use
  request.adminUser = session;
  return null; // passed
}
