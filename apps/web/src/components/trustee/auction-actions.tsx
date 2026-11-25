'use client';

import { type AuctionDto, type AuctionStatus } from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Field } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';

const CAN_CANCEL: AuctionStatus[] = ['DRAFT', 'PUBLISHED', 'REGISTRATION_CLOSED'];
const CAN_STOP: AuctionStatus[] = ['LIVE', 'PREEMPTION'];

/** Publish / cancel / stop buttons. The server decides what is actually allowed. */
export function AuctionActions({
  auctionId,
  status,
  publishBlockedReason,
}: {
  auctionId: string;
  status: AuctionStatus;
  /** When set, publishing is not offered and this explanation is shown instead. */
  publishBlockedReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'cancel' | 'stop' | null>(null);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  async function run(action: 'publish' | 'cancel' | 'stop', body?: unknown) {
    setPending(true);
    setError(null);
    const result = await apiJson<AuctionDto>('POST', `/api/auctions/${auctionId}/${action}`, body);
    setPending(false);
    if (!result.ok) {
      setError({ message: result.message, fields: result.fields });
      return;
    }
    setOpen(null);
    router.refresh();
  }

  function onReason(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!open) return;
    void run(open, { reason: textField(new FormData(e.currentTarget), 'reason') });
  }

  const canCancel = CAN_CANCEL.includes(status);
  const canStop = CAN_STOP.includes(status);
  if (status !== 'DRAFT' && !canCancel && !canStop) return null;

  const fieldMessages = error ? Object.entries(error.fields).filter(([k]) => k !== 'reason') : [];

  return (
    <div className="grid gap-3">
      {status === 'DRAFT' && publishBlockedReason && (
        <Alert variant="warning">{publishBlockedReason}</Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {status === 'DRAFT' && !publishBlockedReason && (
          <Button
            disabled={pending}
            onClick={() => {
              if (window.confirm('Objavim dražbo? Po objavi podatkov ni več mogoče spreminjati.')) {
                void run('publish');
              }
            }}
          >
            Objavi dražbo
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setOpen(open === 'cancel' ? null : 'cancel');
              setError(null);
            }}
          >
            Prekliči dražbo
          </Button>
        )}
        {canStop && (
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setOpen(open === 'stop' ? null : 'stop');
              setError(null);
            }}
          >
            Ustavi dražbo
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={onReason} className="grid gap-3 rounded-lg border p-3">
          <Field
            id="reason"
            label={open === 'cancel' ? 'Razlog za preklic' : 'Razlog za ustavitev'}
            required
            error={error?.fields.reason}
            hint="Razlog se zapiše v revizijsko sled dražbe."
          >
            <Textarea id="reason" name="reason" rows={3} required minLength={10} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              {open === 'cancel' ? 'Potrdi preklic' : 'Potrdi ustavitev'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(null);
              }}
            >
              Nazaj
            </Button>
          </div>
        </form>
      )}

      {error && (
        <Alert variant="destructive">
          <p>{error.message}</p>
          {fieldMessages.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {fieldMessages.map(([field, text]) => (
                <li key={field}>{text}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}
