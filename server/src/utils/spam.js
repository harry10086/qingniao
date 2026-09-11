/**
 * Spam detection utility
 * Checks comment content against a keyword blacklist and pattern matching
 */

// Common spam keywords (Chinese + English)
const SPAM_KEYWORDS = [
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
 * Check if content is likely spam
 * @param {string} content - The comment content to check
 * @returns {{ isSpam: boolean, reason: string|null }}
 */
export function checkSpam(content) {
  if (!content || typeof content !== 'string') {
    return { isSpam: true, reason: '评论内容不能为空' };
  }

  const lowerContent = content.toLowerCase();

  // Check blacklist keywords
  for (const keyword of SPAM_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return { isSpam: true, reason: '评论包含不当内容' };
    }
  }

  // Check for excessive URLs (more than 2)
  const urls = content.match(URL_REGEX) || [];
  if (urls.length > 2) {
    return { isSpam: true, reason: '评论包含过多链接' };
  }

  // Check for phone numbers
  const phones = content.match(PHONE_REGEX) || [];
  if (phones.length > 0) {
    return { isSpam: true, reason: '评论包含手机号码' };
  }

  // Check for excessive repeated characters (like "啊啊啊啊啊啊啊啊啊啊啊啊")
  if (/(.)\1{9,}/.test(content)) {
    return { isSpam: true, reason: '评论包含过多重复字符' };
  }

  // Content too short (less than 2 characters)
  if (content.trim().length < 2) {
    return { isSpam: true, reason: '评论内容过短' };
  }

  // Content too long (more than 500 characters)
  if (content.length > 500) {
    return { isSpam: true, reason: '评论内容过长（最多500字）' };
  }

  return { isSpam: false, reason: null };
}

/**
 * Sanitize username
 */
export function validateUsername(username) {
  if (!username || username.trim().length < 1) {
    return { valid: false, reason: '用户名不能为空' };
  }
  if (username.length > 30) {
    return { valid: false, reason: '用户名最长30个字符' };
  }
  // Check for spam keywords in username
  const lowerName = username.toLowerCase();
  for (const keyword of SPAM_KEYWORDS.slice(0, 14)) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return { valid: false, reason: '用户名包含不当内容' };
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
