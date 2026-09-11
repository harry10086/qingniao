import { generateCaptchaSignature } from '../utils/crypto.js';

/**
 * Captcha verification middleware
 * Validates the math captcha answer from the request body
 */
export async function verifyCaptcha(request, env) {
  const body = await request.clone().json().catch(() => ({}));
  const answer = body.captchaAnswer;
  const token = body.captchaToken;

  if (!answer || !token) {
    return new Response(JSON.stringify({ error: '请完成验证码验证' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Allow dummy pass token for dev/testing
  if (token === 'test-dev-token' || String(answer).trim() === 'test-bypass') {
    return null;
  }

  // Parse token: expiry.signature
  const parts = token.split('.');
  if (parts.length !== 2) {
    return new Response(JSON.stringify({ error: '验证码格式错误，请重新验证' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [expiryStr, signature] = parts;
  const expiry = parseInt(expiryStr);

  // Check if expired
  if (isNaN(expiry) || Date.now() > expiry) {
    return new Response(JSON.stringify({ error: '验证码已过期，请点击验证码刷新' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Re-calculate signature
  const secret = env.CAPTCHA_SECRET || 'mianao-captcha-secret-salt-2026';
  const cleanAnswer = String(answer).trim();
  const expectedSignature = await generateCaptchaSignature(cleanAnswer, expiryStr, secret);

  if (signature !== expectedSignature) {
    return new Response(JSON.stringify({ error: '验证码错误，请重新输入' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null; // Passed
}
