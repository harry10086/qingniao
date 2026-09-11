/**
 * Resend Email Utility for Qingniao
 */

/**
 * Send email via Resend API
 */
async function sendResendEmail(apiKey, { from, to, subject, html }) {
  if (!apiKey) {
    console.log('[Email] Skipped: RESEND_API_KEY not configured');
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: from || '不吐不快博客 <harry@mianao.info>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      })
    });

    const data = await res.json();
    if (res.ok) {
      console.log('[Email] Sent successfully:', data.id);
      return true;
    } else {
      console.error('[Email] Resend API error:', data);
      return false;
    }
  } catch (err) {
    console.error('[Email] Failed to send email:', err);
    return false;
  }
}

/**
 * Send notification to Admin on new comment
 */
export async function notifyAdminNewComment(env, comment) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return;

  const adminEmail = env.ADMIN_EMAIL || 'harry@mianao.info';
  const sender = env.SENDER_EMAIL || '不吐不快博客 <harry@mianao.info>';
  const articleTitle = comment.page_title || comment.page_path;
  const articleUrl = `https://mianao.info${comment.page_path.startsWith('/') ? '' : '/'}${comment.page_path}`;
  const adminUrl = 'https://mianao.info/comment-admin/';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e8e8e8; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: #49b1f5; padding: 20px; text-align: center; color: white;">
        <h2 style="margin: 0; font-size: 20px;">💬 收到新的文章评论</h2>
      </div>
      <div style="padding: 24px; background: #ffffff; color: #333333;">
        <p style="margin-top: 0;">您的文章 <strong>《${escapeHtml(articleTitle)}》</strong> 收到了一条新评论：</p>
        
        <div style="background: #f7f8fa; border-left: 4px solid #49b1f5; padding: 14px 18px; margin: 18px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #333;">
            👤 ${escapeHtml(comment.username)} <span style="font-size: 12px; font-weight: normal; color: #888;">(${escapeHtml(comment.email)})</span>
          </p>
          <p style="margin: 0; white-space: pre-wrap; font-size: 14px; color: #444;">${escapeHtml(comment.content)}</p>
        </div>

        <p style="margin-bottom: 24px;">状态：<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; background: ${comment.status === 'approved' ? '#f6ffed; color: #52c41a;' : '#fffbe6; color: #faad14;'}">${comment.status === 'approved' ? '已免审通过' : '待审核'}</span></p>

        <div style="text-align: center; margin-top: 28px;">
          <a href="${adminUrl}" style="display: inline-block; background: #49b1f5; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">进入后台管理评论</a>
          <a href="${articleUrl}" style="display: inline-block; background: #f0f0f0; color: #666; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; margin-left: 10px;">查看文章</a>
        </div>
      </div>
      <div style="background: #f7f8fa; padding: 14px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee;">
        不吐不快 (mianao.info) 评论系统通知
      </div>
    </div>
  `;

  await sendResendEmail(apiKey, {
    from: sender,
    to: adminEmail,
    subject: `💬 新评论提醒：《${articleTitle}》`,
    html
  });
}

/**
 * Send notification to parent comment author on reply
 */
export async function notifyUserReply(env, comment, parentComment) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return;

  // Don't send notification if replying to oneself
  if (comment.email.trim().toLowerCase() === parentComment.email.trim().toLowerCase()) {
    return;
  }

  const sender = env.SENDER_EMAIL || '不吐不快博客 <harry@mianao.info>';
  const articleTitle = comment.page_title || comment.page_path;
  const articleUrl = `https://mianao.info${comment.page_path.startsWith('/') ? '' : '/'}${comment.page_path}#mc-comment-${comment.id}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e8e8e8; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background: #49b1f5; padding: 20px; text-align: center; color: white;">
        <h2 style="margin: 0; font-size: 20px;">💬 您的评论收到了新回复</h2>
      </div>
      <div style="padding: 24px; background: #ffffff; color: #333333;">
        <p style="margin-top: 0;"><strong>${escapeHtml(parentComment.username)}</strong>，您好！</p>
        <p>您在文章 <strong>《${escapeHtml(articleTitle)}》</strong> 发表的评论收到了来自 <strong>${escapeHtml(comment.username)}</strong> 的回复：</p>
        
        <!-- Parent comment snippet -->
        <div style="background: #f7f8fa; border-left: 4px solid #ccc; padding: 10px 14px; margin: 12px 0; border-radius: 4px; font-size: 13px; color: #666;">
          <strong style="color: #444;">您的原评论：</strong> ${escapeHtml(parentComment.content)}
        </div>

        <!-- New reply -->
        <div style="background: #e6f7ff; border-left: 4px solid #49b1f5; padding: 14px 18px; margin: 16px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 0 0 6px 0; font-weight: 600; color: #1890ff;">
            💬 ${escapeHtml(comment.username)} 的回复：
          </p>
          <p style="margin: 0; white-space: pre-wrap; font-size: 14px; color: #333;">${escapeHtml(comment.content)}</p>
        </div>

        <div style="text-align: center; margin-top: 28px;">
          <a href="${articleUrl}" style="display: inline-block; background: #49b1f5; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">查看并回复</a>
        </div>
      </div>
      <div style="background: #f7f8fa; padding: 14px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee;">
        如果您不希望收到此类通知，可直接忽略此邮件 · 不吐不快 (mianao.info)
      </div>
    </div>
  `;

  await sendResendEmail(apiKey, {
    from: sender,
    to: parentComment.email,
    subject: `💬 收到回复通知：《${articleTitle}》`,
    html
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
