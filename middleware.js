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
      const dest = new URL(SIGN_IN_URL, request.url);
      dest.searchParams.set('redirect_url', request.url);
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
