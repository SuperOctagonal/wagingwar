import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasFeature } from '@/lib/planFeatures';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { awardPointsServer } from '@/lib/awardPointsServer';
import { isCommunityAdmin } from '@/lib/admin';

const MAX_CONTENT = 5000;

// POST: create a reply. clerk_id always from the session. Also bumps the
// parent post's reply_count/last_activity_at here (server-side, right
// after the insert succeeds) -- replaces the separate client PATCH that
// used to do this from app/community/post/[id]/page.js (~197).
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!hasFeature(user?.publicMetadata?.plan, 'community_post')) {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { post_id, content } = await req.json().catch(() => ({}));
  if (!post_id || !/^\d+$/.test(String(post_id)) || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (typeof content !== 'string' || content.length > MAX_CONTENT) {
    return NextResponse.json({ error: 'Content too long' }, { status: 400 });
  }

  const { ok, status, data } = await sbAdminRaw('replies?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: { post_id, clerk_id: userId, content, votes: 0 },
  });
  if (!ok) return NextResponse.json({ error: `Supabase ${status}` }, { status: 502 });

  const row = Array.isArray(data) ? data[0] : data;

  // Bump the parent post's reply_count/last_activity_at -- read-then-write
  // (not a DB-side increment) to match the exact behaviour the old client
  // PATCH had; a lost increment under heavy concurrent replies on the same
  // post is the same pre-existing risk as before, not a new one.
  const { data: postRows } = await sbAdminRaw(`posts?id=eq.${post_id}&select=reply_count`);
  const newCount = (postRows?.[0]?.reply_count || 0) + 1;
  await sbAdminRaw(`posts?id=eq.${post_id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { reply_count: newCount, last_activity_at: new Date().toISOString() },
  });

  if (row?.id != null) {
    awardPointsServer(userId, 'community_reply', { referenceId: `reply:${row.id}`, detail: content.trim().slice(0, 100) }).catch(() => {});
  }
  return NextResponse.json(data);
}

// DELETE ?id= -- author or community admin only.
export async function DELETE(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { ok: foundOk, data: found } = await sbAdminRaw(`replies?id=eq.${id}&select=id,clerk_id`);
  if (!foundOk) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!found || !found.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (found[0].clerk_id !== userId && !isCommunityAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ok } = await sbAdminRaw(`replies?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json({ deleted: 1 });
}
