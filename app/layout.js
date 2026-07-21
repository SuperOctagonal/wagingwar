import { ClerkProvider } from '@clerk/nextjs';
import { Space_Grotesk, Bebas_Neue, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import TopNav from '@/components/TopNav';
import FooterChrome from '@/components/FooterChrome';
import CookieBanner from '@/components/CookieBanner';
import MobileChromeVars from '@/components/MobileChromeVars';
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
          <MobileChromeVars />
          <TopNav />
          {children}
          {/* Responsible gambling banner + footer — desktop/mobile variant chosen by useIsMobile */}
          <FooterChrome />
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
