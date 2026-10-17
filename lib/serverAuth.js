import 'server-only';
import { auth } from '@clerk/nextjs/server';

// Single place every new private-data route calls to get the session's
// Clerk user id. clerk_id must always come from here, never from a request
// body/query/header -- every route below passes this straight into its
// Supabase filters/inserts instead of trusting anything the client sent.
export async function requireUser() {
  const { userId } = await auth();
  return userId || null;
}
