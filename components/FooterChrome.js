'use client';

import useIsMobile from '@/hooks/useIsMobile';

// Responsible-gambling banner + footer, consolidated onto the shared coarse-pointer-aware
// useIsMobile hook instead of Tailwind's width-only md: breakpoint — a landscape phone
// (e.g. 844px wide, coarse pointer) must get the mobile variant, not the desktop one.
// Required wording, identical on every page and both variants:
// "18+ · Please gamble responsibly · Gambling Help 1800 858 858 · gamblinghelponline.org.au"
function RgLine({ linkClass }) {
  return (
    <span>
      18+ · Please gamble responsibly · <span className="whitespace-nowrap">Gambling Help 1800 858 858</span> ·{' '}
      <a href="https://www.gamblinghelponline.org.au" target="_blank" rel="noopener noreferrer" className={linkClass}>gamblinghelponline.org.au</a>
    </span>
  );
}

export default function FooterChrome() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div id="mobile-rg-banner" className="fixed bottom-14 left-0 right-0 z-[1001] flex flex-wrap items-center justify-center gap-x-2 px-3 py-1 bg-gray-800 text-[10px] text-gray-300 text-center">
        <RgLine linkClass="underline" />
        <a href="/responsible-gambling" className="underline">Responsible Gambling</a>
      </div>
    );
  }

  // flex-wrap on both rows: this desktop variant is also the first render on
  // phones (isMobile starts false), and an unwrappable row there widened the
  // mobile layout viewport, pushing fixed-bottom UI (cookie banner) off-screen.
  return (
    <>
      <div id="desktop-rg-strip" className="flex flex-wrap flex-shrink-0 items-center justify-center px-4 py-1.5 bg-gray-800 text-[11px] text-gray-300 gap-3 text-center">
        <RgLine linkClass="underline hover:text-white transition-colors" />
      </div>
      <footer id="desktop-footer" className="flex flex-wrap flex-shrink-0 items-center justify-center gap-x-5 gap-y-1 px-4 py-2 bg-white border-t border-gray-100 text-[10px] text-gray-900">
        <span>© {new Date().getFullYear()} Waging War</span>
        <a href="/privacy"                 className="hover:text-gray-600 transition-colors">Privacy Policy</a>
        <a href="/terms"                   className="hover:text-gray-600 transition-colors">Terms of Service</a>
        <a href="/responsible-gambling"    className="hover:text-gray-600 transition-colors">Responsible Gambling</a>
        <a href="/faq"                     className="hover:text-gray-600 transition-colors">FAQ</a>
        <a href="/upcoming"                className="hover:text-gray-600 transition-colors">Upcoming Features</a>
        <a href="mailto:support@wagingwar.com.au" className="hover:text-gray-600 transition-colors">Contact</a>
      </footer>
    </>
  );
}
