/**
 * Cloudflare KV Cache Helper
 * Ultra-fast global read-aside cache for comments (bypasses D1 queries)
 */

/**
 * Get JSON data from KV
 */
export async function getFromKv(env, key) {
  if (!env || !env.mianaoinfoKV) return null;
  try {
    return await env.mianaoinfoKV.get(key, 'json');
  } catch (err) {
    console.error('[KV Cache Read Error]', key, err);
    return null;
  }
}

/**
 * Save JSON data to KV with expiration TTL (default 10 minutes)
 */
export async function saveToKv(env, key, data, ttlSeconds = 600) {
  if (!env || !env.mianaoinfoKV) return;
  try {
    await env.mianaoinfoKV.put(key, JSON.stringify(data), { expirationTtl: Math.max(ttlSeconds, 60) });
  } catch (err) {
    console.error('[KV Cache Write Error]', key, err);
  }
}

/**
 * Safely purge KV cache when comments are posted, approved, rejected, or deleted
 */
export async function purgeKvCache(env, pagePath = null) {
  if (!env || !env.mianaoinfoKV) return;
  try {
    const promises = [
      env.mianaoinfoKV.delete('kv_recent:5'),
      env.mianaoinfoKV.delete('kv_recent:6'),
      env.mianaoinfoKV.delete('kv_recent:8'),
      env.mianaoinfoKV.delete('kv_recent:20'),
    ];

    if (pagePath) {
      promises.push(env.mianaoinfoKV.delete(`kv_count:${pagePath}`));
      const sorts = ['newest', 'oldest', 'most_upvoted'];
      const limits = [10, 20, 30, 50];
      const pages = [1, 2, 3, 4, 5];
      for (const s of sorts) {
        for (const l of limits) {
          for (const p of pages) {
            promises.push(env.mianaoinfoKV.delete(`kv_comments:${pagePath}:${p}:${l}:${s}`));
          }
        }
      }
    }

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('[KV Cache Purge Error]', err);
  }
}
