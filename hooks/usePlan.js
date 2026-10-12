import { useUser } from '@clerk/nextjs';

// 'free'|'pro' -- the raw Clerk publicMetadata.plan value, normalised so an
// unset/unknown value (never subscribed, or a value this app doesn't
// recognise -- including a stale 'lite' from before that tier was removed)
// reads as 'free' rather than undefined. Mirrors the webhook's own
// fail-safe-toward-'free' convention for inactive statuses.
export default function usePlan() {
  const { user } = useUser();
  const plan = user?.publicMetadata?.plan;
  return plan === 'pro' ? plan : 'free';
}
