import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateAccount } from '@/lib/credits';

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_KEY;

// GET: this user's credit balance, owned item ids, and currently-equipped
// border/flair (badges have no equip concept -- "owned" is the only state
// that matters for them, they just accumulate in the badge case).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!SURL || !SKEY) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

  const [account, ownedRows] = await Promise.all([
    getOrCreateAccount(userId),
    fetch(
      `${SURL}/rest/v1/user_cosmetics?clerk_id=eq.${encodeURIComponent(userId)}&select=item_id,equipped,unlocked_at,cosmetic_items(category)`,
      { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } },
    ).then(r => (r.ok ? r.json() : [])),
  ]);

  const equipped = { border: null, flair: null };
  for (const row of ownedRows) {
    if (row.equipped && row.cosmetic_items?.category === 'border') equipped.border = row.item_id;
    if (row.equipped && row.cosmetic_items?.category === 'flair') equipped.flair = row.item_id;
  }

  return NextResponse.json({
    balance: account.balance || 0,
    owned: ownedRows.map(row => row.item_id),
    equipped,
  });
}
