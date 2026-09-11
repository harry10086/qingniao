/**
 * Spam Detection and Validation Utility
 */

const SPAM_KEYWORDS = [
  '加微信', '加QQ', '代写', '代做', '代考', '包过', '包通过',
  '免费领', '点击领取', '扫码', '优惠券', '折扣', '促销',
  'casino', 'gambling', 'viagra', 'crypto', 'bitcoin',
  'make money', 'earn money', 'click here', 'buy now',
  'VPN', '节点', '节点推荐', '机场', 'v2ray', 'ssr', 'Trojan', 'vless', 'tuic', 'clash', 'AI绘画', 'AI代理',
  '垃圾', '傻逼', '操你', '去死', '废物',
];

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const PHONE_REGEX = /1[3-9]\d{9}/g;

export function checkSpam(content) {
  if (!content || typeof content !== 'string') {
    return { isSpam: true, reason: '评论内容不能为空' };
  }

  const lowerContent = content.toLowerCase();

  for (const keyword of SPAM_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return { isSpam: true, reason: '评论包含不当或敏感内容' };
    }
  }

  const urls = content.match(URL_REGEX) || [];
  if (urls.length > 2) {
    return { isSpam: true, reason: '评论包含过多外部链接' };
  }

  const phones = content.match(PHONE_REGEX) || [];
  if (phones.length > 0) {
    return { isSpam: true, reason: '评论包含联系电话信息' };
  }

  if (/(.)\1{9,}/.test(content)) {
    return { isSpam: true, reason: '评论包含过多连续重复字符' };
  }

  if (content.trim().length < 2) {
    return { isSpam: true, reason: '评论内容过短（至少2个字符）' };
  }

  if (content.length > 500) {
    return { isSpam: true, reason: '评论内容过长（最多500字）' };
  }

  return { isSpam: false, reason: null };
}

export function validateUsername(username) {
  if (!username || username.trim().length < 1) {
    return { valid: false, reason: '昵称/用户名不能为空' };
  }
  if (username.length > 30) {
    return { valid: false, reason: '昵称最长支持 30 个字符' };
  }
  const lowerName = username.toLowerCase();
  for (const keyword of SPAM_KEYWORDS.slice(0, 14)) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return { valid: false, reason: '昵称包含不当内容' };
    }
  }
  return { valid: true, reason: null };
}

export function validateEmail(email) {
  if (!email) {
    return { valid: false, reason: '邮箱不能为空（用于接收回复通知与头像识别）' };
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
