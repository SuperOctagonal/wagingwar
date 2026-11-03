'use client';
import { usePathname } from 'next/navigation';

// Under Clerk's email-code step (/sign-up/verify-email-address): people
// often leave to find the code and lose the page, or it lands in Junk.
export default function AuthCodeNote() {
  const pathname = usePathname() || '';
  if (!/\/verify-email-address\/?$/.test(pathname)) return null;
  return (
    <p data-testid="code-note" style={{ fontSize: 13, color: '#374151', maxWidth: 360, textAlign: 'center', margin: 0 }}>
      Keep this page open. The code goes to your email, so check Junk if it doesn&apos;t arrive.
    </p>
  );
}
