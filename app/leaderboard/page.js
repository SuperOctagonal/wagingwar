'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LeaderboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/competitions#leaderboard');
  }, [router]);
  return null;
}
