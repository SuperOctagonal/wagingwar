import { headers } from 'next/headers';
import { isMetaInAppBrowser } from '@/lib/inAppBrowser.mjs';
import AuthCodeNote from '@/components/AuthCodeNote';

// Shared frame for /sign-up and /sign-in (Clerk's <SignUp/> / <SignIn/>).
//
// - Its own scroll area that ends above the fixed mobile RG banner + tab bar
//   AND the cookie banner while it's showing (.auth-page in globals.css;
//   heights from MobileChromeVars and CookieBanner): Email and Continue are
//   never half-hidden behind them, so a tap never lands on the banner.
// - Instagram / Facebook / Messenger in-app browsers: Google blocks its
//   sign-in in embedded webviews, so the Google button is hidden there and
//   one line points to email or Open in browser. Decided on the server from
//   the User-Agent, so normal browsers render exactly as before.
//
// children: (appearance) => the Clerk component, given the appearance to use.
export default async function AuthPageShell({ intro, children }) {
  const inApp = isMetaInAppBrowser((await headers()).get('user-agent'));
  const appearance = inApp
    ? { elements: { socialButtonsRoot: { display: 'none' }, dividerRow: { display: 'none' } } }
    : undefined;
  return (
    <main className="flex-1 overflow-y-auto auth-page" style={{ background: '#f9f9f9' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100%', gap: 16, padding: '24px 16px 0' }}>
        {intro}
        {inApp && (
          <p data-testid="in-app-note" style={{ fontSize: 13, color: '#374151', maxWidth: 360, textAlign: 'center', margin: 0 }}>
            Signing up from Instagram or Facebook? Use email below, or tap the three dots and choose Open in browser to use Google.
          </p>
        )}
        {children(appearance)}
        <AuthCodeNote />
      </div>
    </main>
  );
}
