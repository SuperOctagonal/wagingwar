import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f9f9f9', gap: 16 }}>
      <p style={{ fontSize: 13, color: '#374151', maxWidth: 360, textAlign: 'center', margin: 0 }}>
        Free: live bookmaker prices, price moves and race results.
      </p>
      <SignUp />
    </div>
  );
}
