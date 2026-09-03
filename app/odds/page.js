import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { isSiteAdmin } from '@/lib/admin';
import OddsPageClient from './OddsPageClient';

// Temporary admin-only lockdown -- PuntersEdge's data license currently only
// covers internal testing, not display to real subscribers. Reopen (all
// subscribers or Pro-only, TBD) once the Plus tier + attribution credit are
// in place. Redirects rather than notFound()/blurred-preview per explicit
// instruction: non-admins should see no trace of this page at all.
export default async function OddsPage() {
  const { userId } = await auth();
  if (!userId || !isSiteAdmin(userId)) redirect('/races');

  return <OddsPageClient />;
}
