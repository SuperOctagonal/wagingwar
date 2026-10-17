import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { hasFeature } from '@/lib/planFeatures';
import { sbAdminRaw } from '@/lib/supabaseAdmin';
import { awardPointsServer } from '@/lib/awardPointsServer';
import { isCommunityAdmin } from '@/lib/admin';

const MAX_TITLE = 200;
const MAX_BODY = 5000;

// POST: create a post. user_id always from the session (never the body).
// Points are awarded here as a side effect of the verified write, keyed to
// the new post's own id, instead of the client calling awardPoints
// directly over the anon key.
export async function POST(req) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!hasFeature(user?.publicMetadata?.plan, 'community_post')) {
    return NextResponse.json({ error: 'Pro required' }, { status: 403 });
  }

  const { section, title, body, image_url: imageUrl } = await req.json().catch(() => ({}));
  if (!section || !title || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (typeof title !== 'string' || title.length > MAX_TITLE) return NextResponse.json({ error: 'Title too long' }, { status: 400 });
  if (typeof body !== 'string' || body.length > MAX_BODY) return NextResponse.json({ error: 'Body too long' }, { status: 400 });

  const { ok, status, data } = await sbAdminRaw('posts?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: { user_id: userId, section, title, body, image_url: imageUrl || null, votes: 0, reply_count: 0 },
  });
  if (!ok) return NextResponse.json({ error: `Supabase ${status}` }, { status: 502 });

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.id != null) {
    awardPointsServer(userId, 'community_post', { referenceId: `post:${row.id}`, detail: title.slice(0, 100) }).catch(() => {});
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

  const { ok: foundOk, data: found } = await sbAdminRaw(`posts?id=eq.${id}&select=id,user_id`);
  if (!foundOk) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  if (!found || !found.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (found[0].user_id !== userId && !isCommunityAdmin(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ok } = await sbAdminRaw(`posts?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' });
  if (!ok) return NextResponse.json({ error: 'Supabase error' }, { status: 502 });
  return NextResponse.json({ deleted: 1 });
}
