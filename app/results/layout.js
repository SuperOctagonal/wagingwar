import { Suspense } from 'react';

export default function ResultsLayout({ children }) {
  // page.js (a Server Component) owns generateMetadata — layouts never
  // receive searchParams in the App Router, only page.js does, so the
  // per-venue/date dynamic title/description lives there instead.
  //
  // ResultsPageClient uses useSearchParams() (to read ?date=/?venue= so
  // there's something real for that metadata to reflect) — the App
  // Router requires a Suspense boundary around any client component that
  // calls it, or the route can't be statically rendered.
  return <Suspense fallback={null}>{children}</Suspense>;
}
