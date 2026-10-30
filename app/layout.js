import { Suspense } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Space_Grotesk, Bebas_Neue, JetBrains_Mono } from 'next/font/google';
import TopNav from '@/components/TopNav';
import FooterChrome from '@/components/FooterChrome';
import CookieBanner from '@/components/CookieBanner';
import MobileChromeVars from '@/components/MobileChromeVars';
import RadioPlayer from '@/components/RadioPlayer';
import Analytics from '@/components/Analytics';
import SignupTracker from '@/components/SignupTracker';
import AttributionCapture from '@/components/AttributionCapture';
import './globals.css';

const spaceGrotesk = Space_Grotesk({ subsets:['latin'], variable:'--font-space-grotesk', weight:['400','500','600','700'], display:'swap' });
const bebasNeue    = Bebas_Neue   ({ subsets:['latin'], variable:'--font-bebas-neue',    weight:['400'],                    display:'swap' });
const jetbrainsMono= JetBrains_Mono({ subsets:['latin'], variable:'--font-jetbrains-mono', weight:['400','500','700'],       display:'swap' });

export const metadata = {
  metadataBase: new URL('https://wagingwar.com.au'),
  title: {
    default: 'Waging War | Horse Racing Analytics and Bet Tracking Australia',
    template: '%s | Waging War',
  },
  description: 'Live bookmaker prices, free for every punter, plus Australian horse racing analytics and community features',
  // Self-referencing canonical on every page ('./' resolves to each page's
  // own path, query string dropped); pages with meaningful params override.
  alternates: { canonical: './' },
  icons: { icon: '/images/icon-app-72.png' },
  openGraph: {
    title: 'Waging War | Horse Racing Analytics and Bet Tracking Australia',
    description: "Live bookmaker prices free for every punter. Score and rank every runner, track your bets with real P&L, and follow daily tipping competitions - built for serious Australian punters.",
    url: 'https://wagingwar.com.au',
    siteName: 'Waging War',
    images: ['/images/logo-full.png'],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Waging War | Horse Racing Analytics and Bet Tracking Australia',
    description: "Live bookmaker prices free for every punter. Score and rank every runner, track your bets with real P&L, and follow daily tipping competitions - built for serious Australian punters.",
    images: ['/images/logo-full.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${spaceGrotesk.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`}>
        <head>
          <meta name="format-detection" content="telephone=no, address=no, email=no" />
          {/* Non-blocking icon CSS: loads as media="print" (doesn't block
              render), then the inline script below flips it to "all" once
              loaded. React drops string onLoad handlers, hence the script. */}
          <link
            id="tabler-icons-css"
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css"
            media="print"
            suppressHydrationWarning
          />
          <script
            dangerouslySetInnerHTML={{
              __html: "(function(){var l=document.getElementById('tabler-icons-css');if(!l)return;var on=function(){l.media='all'};if(l.sheet)on();else l.addEventListener('load',on);})();",
            }}
          />
          <noscript>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css" />
          </noscript>
          {/* Organization/WebSite JSON-LD lives on the home page (app/page.js). */}
        </head>
        <body className="font-space text-[13px] bg-slate-100 text-gray-900 h-full flex flex-col overflow-hidden">
          <MobileChromeVars />
          <TopNav />
          {children}
          {/* Responsible gambling banner + footer — desktop/mobile variant chosen by useIsMobile */}
          <FooterChrome />
          <CookieBanner />
          {/* Live racing radio (RSN 927) — global, collapsible, visible to
              everyone (not Pro-gated). See components/RadioPlayer.js. */}
          <RadioPlayer />
          <SignupTracker />
          <AttributionCapture />
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
