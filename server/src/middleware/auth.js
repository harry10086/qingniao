/**
 * Admin authentication middleware
 * Validates session token against KV store
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
  const KV = env.KV || env.mianaoinfoKV;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV 命名空间未绑定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await KV.get(`session:${token}`, { type: 'json' });
  if (!session) {
    return new Response(JSON.stringify({ error: '登录已过期，请重新登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  request.adminUser = session;
  return null;
}
