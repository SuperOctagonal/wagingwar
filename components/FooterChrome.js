'use client';

import useIsMobile from '@/hooks/useIsMobile';

// Responsible-gambling banner + footer, consolidated onto the shared coarse-pointer-aware
// useIsMobile hook instead of Tailwind's width-only md: breakpoint — a landscape phone
// (e.g. 844px wide, coarse pointer) must get the mobile variant, not the desktop one.
export default function FooterChrome() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div id="mobile-rg-banner" className="fixed bottom-14 left-0 right-0 z-[1001] flex items-center justify-center gap-2 px-3 py-1 bg-gray-800 text-[10px] text-gray-300">
        Gamble responsibly.
        <a href="/responsible-gambling" className="underline">
          Help: 1800&nbsp;858&nbsp;858
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-center justify-center px-4 py-1.5 bg-gray-800 text-[11px] text-gray-300 gap-3">
        Gamble responsibly. Never bet more than you can afford to lose.
        <a href="/responsible-gambling" className="underline hover:text-white transition-colors">
          For help call 1800&nbsp;858&nbsp;858
        </a>
      </div>
      <footer className="flex flex-shrink-0 items-center justify-center gap-5 px-4 py-2 bg-white border-t border-gray-100 text-[10px] text-gray-400">
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
