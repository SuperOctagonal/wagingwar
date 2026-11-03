import { SignUp } from '@clerk/nextjs';
import AuthPageShell from '@/components/AuthPageShell';

export default function SignUpPage() {
  return (
    <AuthPageShell
      intro={(
        <p style={{ fontSize: 13, color: '#374151', maxWidth: 360, textAlign: 'center', margin: 0 }}>
          Free: live bookmaker prices, price moves and race results.
        </p>
      )}
    >
      {appearance => <SignUp appearance={appearance} />}
    </AuthPageShell>
  );
}
