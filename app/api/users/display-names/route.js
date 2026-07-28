import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { punterFallback } from '@/lib/punterFallback';

// Resolves clerk_id -> username-or-fallback for OTHER users. The client
// Clerk SDK only ever exposes the current signed-in user, so anywhere
// this app shows someone else's name (Community posts/replies/leaderboard,
// Competitions leaderboard) has to go through the server, which is the
// only side that can look up arbitrary users' Clerk data. Login-required
// (not admin-only) — this is regular user-facing content, just guarded
// against being a fully open scrape target.
//
// Short in-memory cache — this route is called on effectively every
// Community/Competitions page view, and unlike the admin subscriber
// billing cache this one should stay short-lived since a username change
// should show up for other users reasonably quickly, not sit stale for
// minutes.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // clerkId -> { name, expiresAt }

export async function GET(req) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ids = [...new Set((searchParams.get('ids') || '').split(',').filter(Boolean))].slice(0, 200);

  const now = Date.now();
  const stale = ids.filter(id => {
    const entry = cache.get(id);
    return !entry || entry.expiresAt <= now;
  });

  if (stale.length) {
    const clerk = await clerkClient();
    let users = [];
    try {
      const { data } = await clerk.users.getUserList({ userId: stale, limit: stale.length });
      users = data;
    } catch {
      users = [];
    }
    const found = new Map(users.map(u => [u.id, u]));
    for (const id of stale) {
      const u = found.get(id);
      const name = u?.username || punterFallback(id);
      cache.set(id, { name, expiresAt: now + CACHE_TTL_MS });
    }
  }

  const result = {};
  for (const id of ids) {
    result[id] = cache.get(id)?.name ?? punterFallback(id);
  }

  return NextResponse.json(result);
}
