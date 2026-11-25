'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/api-client';

export function RegisterButton({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function register() {
    setPending(true);
    setError(null);
    const result = await apiJson('POST', `/api/auctions/${auctionId}/registrations`);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid justify-items-start gap-3">
      <Button size="lg" disabled={pending} onClick={() => void register()}>
        {pending ? 'Oddajanje …' : 'Oddaj prijavo na dražbo'}
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
