import { SignUp } from '@clerk/nextjs';
import AuthPageShell from '@/components/AuthPageShell';

// Sign-up asks for Email and Password only: Clerk's optional Username row is
// hidden here (layout only, the dashboard setting is unchanged). Without a
// username everyone sees the generated PunterNNNN name (lib/punterFallback.js)
// until the user sets one in Settings.
const withoutUsername = appearance => ({
  ...appearance,
  elements: { ...appearance?.elements, formFieldRow__username: { display: 'none' } },
});

export default function SignUpPage() {
  return (
    <AuthPageShell
      intro={(
        <p style={{ fontSize: 13, color: '#374151', maxWidth: 360, textAlign: 'center', margin: 0 }}>
          Free: live bookmaker prices, price moves and race results.
        </p>
      )}
    >
      {appearance => <SignUp appearance={withoutUsername(appearance)} />}
    </AuthPageShell>
  );
}
