import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/races(.*)',
  '/today(.*)',
  '/results(.*)',
  '/mybets(.*)',
  '/insights(.*)',
  '/community(.*)',
  '/competitions(.*)',
  '/blackbook(.*)',
  '/learn(.*)',
  '/account(.*)',
  '/settings(.*)',
]);

const SIGN_IN_URL = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in';

export default clerkMiddleware(async (auth, request) => {
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
