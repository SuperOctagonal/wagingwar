import { ClerkProvider } from '@clerk/nextjs';
import { Space_Grotesk, Bebas_Neue, JetBrains_Mono } from 'next/font/google';
import TopNav from '@/components/TopNav';
import './globals.css';

const spaceGrotesk = Space_Grotesk({ subsets:['latin'], variable:'--font-space-grotesk', weight:['400','500','600','700'], display:'swap' });
const bebasNeue    = Bebas_Neue   ({ subsets:['latin'], variable:'--font-bebas-neue',    weight:['400'],                    display:'swap' });
const jetbrainsMono= JetBrains_Mono({ subsets:['latin'], variable:'--font-jetbrains-mono', weight:['400','500','700'],       display:'swap' });

export const metadata = {
  title: 'Waging War — Racing Analytics',
  description: 'Australian horse racing analytics and community platform',
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${spaceGrotesk.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`}>
        <head>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css" />
        </head>
        <body className="font-space text-[13px] bg-slate-100 text-gray-900 h-full flex flex-col overflow-hidden">
          <TopNav />
          {children}
          <footer className="hidden md:flex flex-shrink-0 items-center justify-center gap-5 px-4 py-2 bg-white border-t border-gray-100 text-[10px] text-gray-400">
            <span>© {new Date().getFullYear()} Waging War</span>
            <a href="/privacy"  className="hover:text-gray-600 transition-colors">Privacy Policy</a>
            <a href="/upcoming" className="hover:text-gray-600 transition-colors">Upcoming Features</a>
            <a href="mailto:adam@wagingwar.com.au" className="hover:text-gray-600 transition-colors">Contact</a>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
