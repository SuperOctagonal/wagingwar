import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { LANDING_VARIANTS } from '@/lib/landingVariants';

const isProtectedRoute = createRouteMatcher([
  '/races(.*)',
  '/today(.*)',
  '/mybets(.*)',
  '/insights(.*)',
  '/community(.*)',
  '/competitions(.*)',
  '/blackbook(.*)',
  '/learn(.*)',
  '/how-it-works(.*)',
  '/account(.*)',
  '/settings(.*)',
  '/admin(.*)',
]);

const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in';

export default clerkMiddleware(async (auth, request) => {
  // Ad landing variants: /?utm_content=<key> renders the prerendered
  // /landing/<key> (lib/landingVariants.js). Rewrite, not redirect -- the
  // visitor's URL and its UTM params stay as-is for GA attribution.
  if (request.nextUrl.pathname === '/') {
    const key = (request.nextUrl.searchParams.get('utm_content') || '').toLowerCase();
    if (key && Object.hasOwn(LANDING_VARIANTS, key)) {
      return NextResponse.rewrite(new URL(`/landing/${key}`, request.url));
    }
  }

  if (isProtectedRoute(request)) {
    try {
      await auth.protect();
    } catch {
      const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const dest = new URL(SIGN_IN_URL, base);
      const redirectTo = new URL(request.nextUrl.pathname + request.nextUrl.search, base);
      dest.searchParams.set('redirect_url', redirectTo.toString());
      return NextResponse.redirect(dest);
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
