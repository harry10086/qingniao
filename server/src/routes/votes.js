/**
 * Votes API routes
 * Handles upvote/downvote on comments
 */
import { generateFingerprint } from '../utils/crypto.js';

/**
 * POST /api/comments/:id/vote
 * Vote on a comment (upvote or downvote)
 */
export async function voteComment(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  // /api/comments/:id/vote
  const commentId = parseInt(pathParts[pathParts.length - 2]);

  if (isNaN(commentId)) {
    return Response.json({ error: '无效的评论 ID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  const { voteType } = body; // 'up' or 'down'
  if (!['up', 'down'].includes(voteType)) {
    return Response.json({ error: '无效的投票类型' }, { status: 400 });
  }

  // Check comment exists and is approved
  const comment = await env.DB.prepare(
    'SELECT id, upvotes, downvotes FROM comments WHERE id = ? AND status = ?'
  ).bind(commentId, 'approved').first();

  if (!comment) {
    return Response.json({ error: '评论不存在' }, { status: 404 });
  }

  // Generate fingerprint for this voter
  const fingerprint = await generateFingerprint(request);

  // Check if already voted
  const existingVote = await env.DB.prepare(
    'SELECT id, vote_type FROM votes WHERE comment_id = ? AND voter_fingerprint = ?'
  ).bind(commentId, fingerprint).first();

  if (existingVote) {
    if (existingVote.vote_type === voteType) {
      // Same vote type -> cancel vote
      await env.DB.prepare('DELETE FROM votes WHERE id = ?').bind(existingVote.id).run();

      const field = voteType === 'up' ? 'upvotes' : 'downvotes';
      await env.DB.prepare(
        `UPDATE comments SET ${field} = MAX(0, ${field} - 1), updated_at = datetime('now') WHERE id = ?`
      ).bind(commentId).run();

      const updated = await env.DB.prepare(
        'SELECT upvotes, downvotes FROM comments WHERE id = ?'
      ).bind(commentId).first();

      return Response.json({
        success: true,
        message: '已取消投票',
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        userVote: null,
      });
    } else {
      // Different vote type -> switch vote
      await env.DB.prepare(
        'UPDATE votes SET vote_type = ?, created_at = datetime(\'now\') WHERE id = ?'
      ).bind(voteType, existingVote.id).run();

      const oldField = existingVote.vote_type === 'up' ? 'upvotes' : 'downvotes';
      const newField = voteType === 'up' ? 'upvotes' : 'downvotes';

      await env.DB.prepare(
        `UPDATE comments SET ${oldField} = MAX(0, ${oldField} - 1), ${newField} = ${newField} + 1, updated_at = datetime('now') WHERE id = ?`
      ).bind(commentId).run();

      const updated = await env.DB.prepare(
        'SELECT upvotes, downvotes FROM comments WHERE id = ?'
      ).bind(commentId).first();

      return Response.json({
        success: true,
        message: voteType === 'up' ? '已赞成' : '已反对',
        upvotes: updated.upvotes,
        downvotes: updated.downvotes,
        userVote: voteType,
      });
    }
  }

  // New vote
  await env.DB.prepare(
    'INSERT INTO votes (comment_id, voter_fingerprint, vote_type) VALUES (?, ?, ?)'
  ).bind(commentId, fingerprint, voteType).run();

  const field = voteType === 'up' ? 'upvotes' : 'downvotes';
  await env.DB.prepare(
    `UPDATE comments SET ${field} = ${field} + 1, updated_at = datetime('now') WHERE id = ?`
  ).bind(commentId).run();

  const updated = await env.DB.prepare(
    'SELECT upvotes, downvotes FROM comments WHERE id = ?'
  ).bind(commentId).first();

  return Response.json({
    success: true,
    message: voteType === 'up' ? '已赞成' : '已反对',
    upvotes: updated.upvotes,
    downvotes: updated.downvotes,
    userVote: voteType,
  });
}

/**
 * GET /api/comments/:id/vote
 * Check current user's vote status on a comment
 */
export async function getVoteStatus(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const commentId = parseInt(pathParts[pathParts.length - 2]);

  if (isNaN(commentId)) {
    return Response.json({ error: '无效的评论 ID' }, { status: 400 });
  }

  const fingerprint = await generateFingerprint(request);

  const vote = await env.DB.prepare(
    'SELECT vote_type FROM votes WHERE comment_id = ? AND voter_fingerprint = ?'
  ).bind(commentId, fingerprint).first();

  return Response.json({
    userVote: vote ? vote.vote_type : null,
  });
}
