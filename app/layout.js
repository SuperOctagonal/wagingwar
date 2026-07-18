import { ClerkProvider } from '@clerk/nextjs';
import { Space_Grotesk, Bebas_Neue, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import TopNav from '@/components/TopNav';
import CookieBanner from '@/components/CookieBanner';
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
  description: 'Australian horse racing analytics and community platform',
  icons: { icon: '/images/icon-app.png' },
  openGraph: {
    title: 'Waging War | Horse Racing Analytics and Bet Tracking Australia',
    description: "Score and rank every runner, track your bets with real P&L, and follow daily tipping competitions - built for serious Australian punters.",
    url: 'https://wagingwar.com.au',
    siteName: 'Waging War',
    images: ['/images/logo-full.png'],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Waging War | Horse Racing Analytics and Bet Tracking Australia',
    description: "Score and rank every runner, track your bets with real P&L, and follow daily tipping competitions - built for serious Australian punters.",
    images: ['/images/logo-full.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${spaceGrotesk.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`}>
        <head>
          <meta name="format-detection" content="telephone=no, address=no, email=no" />
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css" />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@graph': [
                  {
                    '@type': 'Organization',
                    name: 'Waging War',
                    url: 'https://wagingwar.com.au',
                    logo: 'https://wagingwar.com.au/images/logo-full.png',
                  },
                  {
                    '@type': 'WebSite',
                    name: 'Waging War',
                    url: 'https://wagingwar.com.au',
                  },
                ],
              }),
            }}
          />
        </head>
        <body className="font-space text-[13px] bg-slate-100 text-gray-900 h-full flex flex-col overflow-hidden">
          <TopNav />
          {children}
          {/* Responsible gambling banner — desktop (in flow above footer) */}
          <div className="hidden md:flex flex-shrink-0 items-center justify-center px-4 py-1.5 bg-gray-800 text-[11px] text-gray-300 gap-3">
            Gamble responsibly. Never bet more than you can afford to lose.
            <a href="/responsible-gambling" className="underline hover:text-white transition-colors">
              For help call 1800&nbsp;858&nbsp;858
            </a>
          </div>
          <footer className="hidden md:flex flex-shrink-0 items-center justify-center gap-5 px-4 py-2 bg-white border-t border-gray-100 text-[10px] text-gray-400">
            <span>© {new Date().getFullYear()} Waging War</span>
            <a href="/privacy"                 className="hover:text-gray-600 transition-colors">Privacy Policy</a>
            <a href="/terms"                   className="hover:text-gray-600 transition-colors">Terms of Service</a>
            <a href="/responsible-gambling"    className="hover:text-gray-600 transition-colors">Responsible Gambling</a>
            <a href="/upcoming"                className="hover:text-gray-600 transition-colors">Upcoming Features</a>
            <a href="mailto:support@wagingwar.com.au" className="hover:text-gray-600 transition-colors">Contact</a>
          </footer>
          {/* Responsible gambling banner — mobile (fixed above tab bar) */}
          <div className="md:hidden fixed bottom-14 left-0 right-0 z-[1001] flex items-center justify-center gap-2 px-3 py-1 bg-gray-800 text-[10px] text-gray-300">
            Gamble responsibly.
            <a href="/responsible-gambling" className="underline">
              Help: 1800&nbsp;858&nbsp;858
            </a>
          </div>
          <CookieBanner />
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-65VN0H3ECY"
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-65VN0H3ECY');
          `}</Script>
        </body>
      </html>
    </ClerkProvider>
  );
}
