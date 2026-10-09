import usePlan from './usePlan';

// Unchanged output for every caller: true only once Clerk has loaded AND
// plan is exactly 'pro'. Still false while loading (usePlan() reads an
// unloaded user's plan as 'free', same as before this returned
// `user?.publicMetadata?.plan === 'pro'` directly) and false for 'free' --
// several call sites rely on `isPro === false` as a "rendered, not pro"
// check, so this preserves that exact boolean shape rather than exposing
// a loading/undefined state. Lite plan users also get false here, by
// design -- use hasFeature(usePlan(), feature) (lib/planFeatures.js) for
// any check that should treat Lite as unlocked.
export default function useIsPro() {
  return usePlan() === 'pro';
}
