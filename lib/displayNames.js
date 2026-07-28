'use client';

// Shared client-side helper for resolving other users' names via
// /api/users/display-names — used by Community (posts/replies/leaderboard/
// contributors) and Competitions (leaderboard). Returns { [clerkId]: name }.
export async function fetchDisplayNames(clerkIds) {
  const ids = [...new Set((clerkIds || []).filter(Boolean))];
  if (!ids.length) return {};
  try {
    const res = await fetch(`/api/users/display-names?ids=${ids.join(',')}`);
    if (!res.ok) return {};
    return (await res.json()) || {};
  } catch {
    return {};
  }
}
