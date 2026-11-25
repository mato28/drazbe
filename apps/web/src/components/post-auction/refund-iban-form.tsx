'use client';

import { type SubmitEvent } from 'react';
import { Field } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';
import { errorText, useAction } from './use-action';

/** Bidder enters the account the deposit is refunded to. */
export function RefundIbanForm({
  registrationId,
  current,
}: {
  registrationId: string;
  current: string | null;
}) {
  const { pending, error, run } = useAction();
  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const iban = textField(new FormData(e.currentTarget), 'iban');
    void run(() => apiJson('PUT', `/api/registrations/${registrationId}/refund-iban`, { iban }));
  }
  return (
    <form onSubmit={onSubmit} className="grid max-w-md gap-2">
      <Field
        id="refundIban"
        label="IBAN za vračilo varščine"
        error={error ? errorText(error) : undefined}
        hint="Račun, s katerega ste plačali varščino, ali drug račun na vaše ime."
      >
        <div className="flex gap-2">
          <Input
            id="refundIban"
            name="iban"
            defaultValue={current ?? ''}
            placeholder="SI56 …"
            className="font-mono"
            required
          />
          <Button type="submit" disabled={pending}>
            Shrani
          </Button>
        </div>
      </Field>
      {current && !error && !pending && (
        <Alert variant="success">Račun za vračilo je shranjen.</Alert>
      )}
    </form>
  );
}
