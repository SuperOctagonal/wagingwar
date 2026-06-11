import { useUser } from '@clerk/nextjs';

export default function useIsPro() {
  const { user } = useUser();
  return user?.publicMetadata?.plan === 'pro';
}
