'use client';

import { type SignatureCheckDto } from '@domik/shared';
import { type SubmitEvent, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUpload } from '@/lib/api-client';
import { SignatureCheckView } from './signature-check';
import { errorText, useAction } from './use-action';

/** Buyer uploads the contract signed with a qualified e-signature; EU DSS checks it. */
export function BuyerContractUpload({ auctionId }: { auctionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, error, run } = useAction();
  const [check, setCheck] = useState<SignatureCheckDto | null>(null);

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setCheck(null);
    const form = new FormData(e.currentTarget);
    void run(() =>
      apiUpload<{ check: SignatureCheckDto }>(
        `/api/auctions/${auctionId}/contract/buyer-signed`,
        form,
      ),
    ).then((r) => {
      if (r) {
        setCheck(r.check);
        formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="file"
          type="file"
          accept="application/pdf"
          required
          aria-label="Podpisana pogodba (PDF)"
          className="max-w-xs"
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Preverjam podpis …' : 'Naloži podpisano pogodbo'}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <p className="font-medium">Podpisa ni bilo mogoče sprejeti.</p>
          <p>{errorText(error)}</p>
        </Alert>
      )}
      {check && <SignatureCheckView check={check} />}
    </form>
  );
}
