import { useAuth } from '@clerk/nextjs';

export default function useIsPro() {
  const { sessionClaims } = useAuth();
  return sessionClaims?.plan === 'pro';
}
