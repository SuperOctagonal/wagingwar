// Instagram / Facebook / Messenger in-app browsers, from the User-Agent.
// Google blocks its sign-in inside embedded webviews ("disallowed_useragent"),
// so the auth pages hide "Continue with Google" there and point people to
// email or Open in browser (components/AuthPageShell.js).
//
// Plain .mjs (no Next-specific imports) so node --test can run it directly
// (tests/inAppBrowser.test.mjs).
const META_IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger/;

export function isMetaInAppBrowser(userAgent) {
  return META_IN_APP.test(userAgent || '');
}
