import { notFound } from 'next/navigation';
import HomePage from '@/app/page';
import { LANDING_VARIANTS } from '@/lib/landingVariants';
import { HOME_TITLE, HOME_DESCRIPTION } from '@/lib/seo';

// Ad landing variants of the home page. Reached only through middleware.js's
// rewrite of /?utm_content=<key> (the visitor's URL stays /?utm_content=...).
// Rendered on first request, then cached like / (ISR). Not prerendered at
// build: each variant recomputes the 30-day model stats, and doing that for
// every variant in parallel pushed page generation past Next's 60s limit.
export const dynamicParams = true;
export const revalidate = 3600; // same cadence as the homepage model stats

export function generateStaticParams() {
  return [];
}

export const metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
  robots: { index: false, follow: true },
};

export default async function LandingVariantPage({ params }) {
  const { variant } = await params;
  if (!Object.hasOwn(LANDING_VARIANTS, variant)) notFound();
  return <HomePage variant={variant} />;
}
