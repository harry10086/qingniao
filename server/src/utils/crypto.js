import cryptoNode from 'node:crypto';

/**
 * Hash an IP address for privacy-friendly storage
 */
export async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + '_qingniao_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Hash an email address for trusted user tracking
 */
export async function hashEmail(email) {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.trim().toLowerCase() + '_qingniao_email_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

/**
 * Gravatar/Cravatar MD5 hash of an email address
 */
export function md5Email(email) {
  if (!email) return '00000000000000000000000000000000';
  return cryptoNode.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Generate a random session token
 */
export function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a voter fingerprint from IP + User-Agent
 */
export async function generateFingerprint(request) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = request.headers.get('User-Agent') || '';
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + ua + '_qingniao_vote_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 24);
}

/**
 * Generate a signature for math captcha
 */
export async function generateCaptchaSignature(answer, timestamp, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${answer}.${timestamp}.${secret}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
