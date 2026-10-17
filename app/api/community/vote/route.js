import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { awardPointsServer } from '@/lib/awardPointsServer';

// One vote per user per target, backed by the post_votes table (clerk_id,
// target_id, target_type) -- replaces the old client code that just
// incremented posts.votes/replies.votes directly with no per-user record
// at all (so refreshing the page lost your "already voted" state, and
// nothing stopped a user re-sending the PATCH indefinitely). The target's
// votes counter is always recomputed server-side from a real count() over
// post_votes, never trusted from the client.
//
// Needs a unique index so two concurrent requests can't both insert a
// duplicate vote row (not run here -- see the report for the exact SQL):
//   CREATE UNIQUE INDEX post_votes_unique_vote
//     ON post_votes (clerk_id, target_id, target_type);

const TARGET_TABLES = { post: 'posts', reply: 'replies' };

function validTarget(targetType, targetId) {
  if (!TARGET_TABLES[targetType]) return false;
  if (!/^\d+$/.test(String(targetId))) return false;
  return true;
}

async function recomputeVotes(targetType, targetId) {
  const { data } = await sbAdminRaw(`post_votes?target_type=eq.${targetType}&target_id=eq.${targetId}&select=clerk_id`);
  const count = Array.isArray(data) ? data.length : 0;
  await sbAdminRaw(`${TARGET_TABLES[targetType]}?id=eq.${targetId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { votes: count },
  });
  return count;
}

export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { targetType, targetId } = await req.json().catch(() => ({}));
  if (!validTarget(targetType, targetId)) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });

  const { ok: foundOk, data: found } = await sbAdminRaw(`${TARGET_TABLES[targetType]}?id=eq.${targetId}&select=id,${targetType === 'post' ? 'user_id' : 'clerk_id'}`);
  if (!foundOk) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!found || !found.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const authorId = targetType === 'post' ? found[0].user_id : found[0].clerk_id;

  const { data: existingVote } = await sbAdminRaw(`post_votes?clerk_id=eq.${encodeURIComponent(userId)}&target_id=eq.${targetId}&target_type=eq.${targetType}&select=clerk_id&limit=1`);
  const alreadyVoted = Array.isArray(existingVote) && existingVote.length > 0;

  if (!alreadyVoted) {
    const { ok } = await sbAdminRaw('post_votes', {
      method: 'POST',
      prefer: 'return=minimal',
      body: { clerk_id: userId, target_id: +targetId, target_type: targetType },
    });
    if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
    if (authorId && authorId !== userId) {
      awardPointsServer(authorId, 'upvote_received', { referenceId: `vote:${targetType}:${targetId}:${userId}` }).catch(() => {});
    }
  }

  const votes = await recomputeVotes(targetType, targetId);
  return NextResponse.json({ votes, voted: true });
}

// Un-vote.
export async function DELETE(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');
  if (!validTarget(targetType, targetId)) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });

  await sbAdminRaw(`post_votes?clerk_id=eq.${encodeURIComponent(userId)}&target_id=eq.${targetId}&target_type=eq.${targetType}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });

  const votes = await recomputeVotes(targetType, targetId);
  return NextResponse.json({ votes, voted: false });
}
