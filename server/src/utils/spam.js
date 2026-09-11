/**
 * Spam detection and Blacklist utility for Qingniao
 * Checks comment content against keyword blacklists (built-in + database) and pattern matching
 * Checks IP blacklist against database/KV
 */
import { getFromKv, saveToKv } from './kvCache.js';

// Common built-in spam keywords (Chinese + English)
export const BUILTIN_SPAM_KEYWORDS = [
  // Ad/promotion
  '加微信', '加QQ', '代写', '代做', '代考', '包过', '包通过',
  '免费领', '点击领取', '扫码', '优惠券', '折扣', '促销',
  'casino', 'gambling', 'viagra', 'crypto', 'bitcoin',
  'make money', 'earn money', 'click here', 'buy now',
  'VPN', '节点', '节点推荐', '机场', 'v2ray', 'ssr', 'Trojan', 'vless', 'tuic', 'clash', 'AI绘画', 'AI代理',
  // Abuse
  '垃圾', '傻逼', '操你', '去死', '废物',
];

// URL pattern - too many URLs is often spam
const URL_REGEX = /https?:\/\/[^\s]+/gi;
const PHONE_REGEX = /1[3-9]\d{9}/g;

/**
 * Fetch dynamic blocked keywords from KV cache or D1
 */
export async function getDynamicKeywords(env) {
  if (!env || !env.DB) return [];
  const cacheKey = 'kv_spam_rules:keywords';
  const cached = await getFromKv(env, cacheKey);
  if (cached && Array.isArray(cached)) {
    return cached;
  }

  try {
    const res = await env.DB.prepare(
      'SELECT id, keyword, action FROM blocked_keywords ORDER BY id DESC'
    ).all();
    const keywords = res.results || [];
    await saveToKv(env, cacheKey, keywords, 600); // 10 mins cache
    return keywords;
  } catch (err) {
    // If table doesn't exist yet, return empty
    return [];
  }
}

/**
 * Check if an IP Hash is in the blocked IP blacklist
 */
export async function checkIpBlocked(env, ipHash) {
  if (!env || !env.DB || !ipHash) return false;
  const cacheKey = `kv_blocked_ip:${ipHash}`;
  const cached = await getFromKv(env, cacheKey);
  if (cached !== null && cached !== undefined) {
    return cached === true || cached === '1';
  }

  try {
    const record = await env.DB.prepare(
      'SELECT id FROM blocked_ips WHERE ip_hash = ?'
    ).bind(ipHash).first();

    const isBlocked = !!record;
    await saveToKv(env, cacheKey, isBlocked ? '1' : '0', 600);
    return isBlocked;
  } catch (err) {
    return false;
  }
}

/**
 * Check if content is likely spam
 * @param {string} content - The comment content to check
 * @param {Array<{keyword: string, action: string}>} dynamicKeywords - Additional keywords from DB
 * @returns {{ isSpam: boolean, action: 'block'|'pending'|null, reason: string|null }}
 */
export function checkSpam(content, dynamicKeywords = []) {
  if (!content || typeof content !== 'string') {
    return { isSpam: true, action: 'block', reason: '评论内容不能为空' };
  }

  const lowerContent = content.toLowerCase();

  // 1. Check built-in blacklist keywords (always block)
  for (const keyword of BUILTIN_SPAM_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return { isSpam: true, action: 'block', reason: '评论包含不当内容' };
    }
  }

  // 2. Check dynamic database keywords
  let hitPendingRule = false;
  for (const rule of dynamicKeywords) {
    const kw = (typeof rule === 'string' ? rule : rule.keyword || '').trim().toLowerCase();
    const act = (typeof rule === 'object' ? rule.action : 'block') || 'block';
    if (kw && lowerContent.includes(kw)) {
      if (act === 'block') {
        return { isSpam: true, action: 'block', reason: '评论包含受限制的敏感词' };
      } else if (act === 'pending') {
        hitPendingRule = true;
      }
    }
  }

  // 3. Check for excessive URLs (more than 2)
  const urls = content.match(URL_REGEX) || [];
  if (urls.length > 2) {
    return { isSpam: true, action: 'block', reason: '评论包含过多链接' };
  }

  // 4. Check for phone numbers
  const phones = content.match(PHONE_REGEX) || [];
  if (phones.length > 0) {
    return { isSpam: true, action: 'block', reason: '评论包含手机号码' };
  }

  // 5. Check for excessive repeated characters (like "啊啊啊啊啊啊啊啊啊啊啊啊")
  if (/(.)\1{9,}/.test(content)) {
    return { isSpam: true, action: 'block', reason: '评论包含过多重复字符' };
  }

  // 6. Content too short (less than 2 characters)
  if (content.trim().length < 2) {
    return { isSpam: true, action: 'block', reason: '评论内容过短' };
  }

  // 7. Content too long (more than 500 characters)
  if (content.length > 500) {
    return { isSpam: true, action: 'block', reason: '评论内容过长（最多500字）' };
  }

  // If hit a 'pending' sensitive word, flag it for manual review
  if (hitPendingRule) {
    return { isSpam: false, action: 'pending', reason: '命中审核敏感词，转入人工审核' };
  }

  return { isSpam: false, action: null, reason: null };
}

/**
 * Sanitize and validate username
 */
export function validateUsername(username, dynamicKeywords = []) {
  if (!username || username.trim().length < 1) {
    return { valid: false, reason: '用户名不能为空' };
  }
  if (username.length > 30) {
    return { valid: false, reason: '用户名最长30个字符' };
  }
  const lowerName = username.toLowerCase();

  // Check built-in keywords in username
  for (const keyword of BUILTIN_SPAM_KEYWORDS.slice(0, 14)) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return { valid: false, reason: '用户名包含不当内容' };
    }
  }

  // Check dynamic keywords in username
  for (const rule of dynamicKeywords) {
    const kw = (typeof rule === 'string' ? rule : rule.keyword || '').trim().toLowerCase();
    if (kw && lowerName.includes(kw)) {
      return { valid: false, reason: '用户名包含受限制敏感词' };
    }
  }

  return { valid: true, reason: null };
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  if (!email) {
    return { valid: false, reason: '邮箱不能为空' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, reason: '邮箱格式不正确' };
  }
  if (email.length > 100) {
    return { valid: false, reason: '邮箱地址过长' };
  }
  return { valid: true, reason: null };
}
