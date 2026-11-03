import { SignIn } from '@clerk/nextjs';
import AuthPageShell from '@/components/AuthPageShell';

export default function SignInPage() {
  return (
    <AuthPageShell>
      {appearance => <SignIn appearance={appearance} />}
    </AuthPageShell>
  );
}
