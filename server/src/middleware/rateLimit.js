/**
 * Rate limiting middleware using Cloudflare KV
 */
export async function rateLimit(request, env, { maxRequests = 3, windowSeconds = 60 } = {}) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const key = `rate:${ip}`;

  const KV = env.KV || env.mianaoinfoKV;
  if (!KV) return null;

  const current = await KV.get(key, { type: 'json' });
  const now = Math.floor(Date.now() / 1000);

  if (current) {
    if (now - current.start < windowSeconds) {
      if (current.count >= maxRequests) {
        return new Response(JSON.stringify({
          error: `操作过于频繁，请 ${windowSeconds - (now - current.start)} 秒后再试`,
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await KV.put(key, JSON.stringify({
        count: current.count + 1,
        start: current.start,
      }), { expirationTtl: windowSeconds });
    } else {
      await KV.put(key, JSON.stringify({ count: 1, start: now }), {
        expirationTtl: windowSeconds,
      });
    }
  } else {
    await KV.put(key, JSON.stringify({ count: 1, start: now }), {
      expirationTtl: windowSeconds,
    });
  }

  return null;
}
