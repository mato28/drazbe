'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

/** "Prijava" for visitors, "Moj račun" once signed in (resolved in the browser). */
export function AccountLink() {
  const { data } = authClient.useSession();
  return (
    <Button asChild size="sm" variant={data ? 'outline' : 'default'}>
      <Link href={data ? '/nadzorna-plosca' : '/prijava'}>{data ? 'Moj račun' : 'Prijava'}</Link>
    </Button>
  );
}
