/**
 * Cloudflare KV Edge Cache Helper
 */

export async function getFromKv(env, key) {
  const KV = env.KV || env.CACHE_KV || env.mianaoinfoKV;
  if (!KV) return null;
  try {
    return await KV.get(key, 'json');
  } catch (err) {
    console.error('[KV Cache Read Error]', key, err);
    return null;
  }
}

export async function saveToKv(env, key, data, ttlSeconds = 600) {
  const KV = env.KV || env.CACHE_KV || env.mianaoinfoKV;
  if (!KV) return;
  try {
    await KV.put(key, JSON.stringify(data), { expirationTtl: Math.max(ttlSeconds, 60) });
  } catch (err) {
    console.error('[KV Cache Write Error]', key, err);
  }
}

export async function purgeKvCache(env, pagePath = null) {
  const KV = env.KV || env.CACHE_KV || env.mianaoinfoKV;
  if (!KV) return;
  try {
    const promises = [
      KV.delete('kv_recent:5'),
      KV.delete('kv_recent:6'),
      KV.delete('kv_recent:8'),
      KV.delete('kv_recent:10'),
      KV.delete('kv_recent:20'),
    ];

    if (pagePath) {
      promises.push(KV.delete(`kv_count:${pagePath}`));
      const sorts = ['newest', 'oldest', 'most_upvoted'];
      const limits = [10, 20, 30, 50];
      const pages = [1, 2, 3, 4, 5];
      for (const s of sorts) {
        for (const l of limits) {
          for (const p of pages) {
            promises.push(KV.delete(`kv_comments:${pagePath}:${p}:${l}:${s}`));
          }
        }
      }
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('[KV Cache Purge Error]', err);
  }
}
