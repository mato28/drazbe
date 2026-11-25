'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        void authClient.signOut().then(() => {
          router.replace('/');
          router.refresh();
        })
      }
    >
      <LogOut aria-hidden />
      Odjava
    </Button>
  );
}
