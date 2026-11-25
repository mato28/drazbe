'use client';

import { DEPOSIT_STATUS_LABEL, type DepositStatus } from '@domik/shared';
import { type SubmitEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';
import { errorText, useAction } from './use-action';

export interface DepositRow {
  registrationId: string;
  pseudonym: string;
  name: string;
  depositStatus: DepositStatus;
  refundIban: string | null;
  inOrder: boolean;
  refundedAt: string | null;
}

function IbanEditor({ row }: { row: DepositRow }) {
  const { pending, error, run } = useAction();
  const [editing, setEditing] = useState(row.refundIban === null);
  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{row.refundIban}</span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Spremeni
        </Button>
      </span>
    );
  }
  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const iban = textField(new FormData(e.currentTarget), 'iban');
    void run(() =>
      apiJson('PUT', `/api/registrations/${row.registrationId}/refund-iban`, { iban }),
    ).then((r) => {
      if (r) setEditing(false);
    });
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-1">
      <span className="flex gap-2">
        <Input
          name="iban"
          defaultValue={row.refundIban ?? ''}
          placeholder="SI56 …"
          className="h-8 max-w-60 font-mono text-xs"
          aria-label={`IBAN za vračilo (${row.pseudonym})`}
        />
        <Button size="sm" type="submit" disabled={pending}>
          Shrani
        </Button>
      </span>
      {error && <span className="text-xs text-destructive">{errorText(error)}</span>}
    </form>
  );
}

/** Deposits after the auction: refund IBANs, SEPA refund orders, marking refunds done. */
export function RefundPanel({ auctionId, rows }: { auctionId: string; rows: DepositRow[] }) {
  const order = useAction();
  const mark = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const pending = rows.filter((r) => r.depositStatus === 'REFUND_PENDING');
  const ready = pending.filter((r) => !r.inOrder && r.refundIban);

  function onOrder(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const executionDate = textField(new FormData(e.currentTarget), 'executionDate');
    void order
      .run(() =>
        apiJson<{ included: { pseudonym: string }[]; missingIban: string[] }>(
          'POST',
          `/api/auctions/${auctionId}/refund-orders`,
          executionDate ? { executionDate } : {},
        ),
      )
      .then((r) => {
        if (r) {
          setResult(
            `Nalog pripravljen za: ${r.included.map((p) => p.pseudonym).join(', ')}.` +
              (r.missingIban.length > 0
                ? ` Brez IBAN (niso vključeni): ${r.missingIban.join(', ')}.`
                : ''),
          );
        }
      });
  }

  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li
            key={r.registrationId}
            className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center"
          >
            <span className="flex items-center gap-2">
              {r.depositStatus === 'REFUND_PENDING' && (
                <input
                  type="checkbox"
                  aria-label={`Izberi ${r.pseudonym}`}
                  checked={selected.includes(r.registrationId)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, r.registrationId]
                        : s.filter((x) => x !== r.registrationId),
                    )
                  }
                />
              )}
              <span>
                <span className="font-medium">{r.name}</span>{' '}
                <span className="text-muted-foreground">({r.pseudonym})</span>
              </span>
            </span>
            <span>
              {r.depositStatus === 'REFUND_PENDING' && !r.inOrder ? (
                <IbanEditor row={r} />
              ) : (
                r.refundIban && <span className="font-mono text-xs">{r.refundIban}</span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {r.inOrder && r.depositStatus === 'REFUND_PENDING' && (
                <Badge variant="secondary">v nalogu</Badge>
              )}
              <Badge
                variant={
                  r.depositStatus === 'REFUNDED'
                    ? 'success'
                    : r.depositStatus === 'FORFEITED'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {DEPOSIT_STATUS_LABEL[r.depositStatus]}
              </Badge>
            </span>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <form onSubmit={onOrder} className="flex flex-wrap items-end gap-2 rounded-lg border p-4">
          <div className="grid gap-1.5">
            <label htmlFor="executionDate" className="text-sm font-medium">
              Datum izvršitve
            </label>
            <Input id="executionDate" name="executionDate" type="date" className="w-44" />
          </div>
          <Button type="submit" disabled={order.pending || ready.length === 0}>
            {order.pending
              ? 'Pripravljam …'
              : `Pripravi nalog SEPA za vračila (${String(ready.length)})`}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Datoteka pain.001 (XML) z bremenitvijo računa stečajne mase. Naložite jo v spletno
            banko; ko banka izvede plačila, vračila označite spodaj.
          </p>
        </form>
      )}
      {order.error && <Alert variant="destructive">{errorText(order.error)}</Alert>}
      {result && <Alert variant="success">{result}</Alert>}

      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={mark.pending || selected.length === 0}
            onClick={() => {
              void mark
                .run(() =>
                  apiJson('POST', `/api/auctions/${auctionId}/refunds`, {
                    registrationIds: selected,
                  }),
                )
                .then((r) => {
                  if (r) setSelected([]);
                });
            }}
          >
            Označi izbrane kot vrnjene ({selected.length})
          </Button>
          {mark.error && <span className="text-sm text-destructive">{errorText(mark.error)}</span>}
        </div>
      )}
    </div>
  );
}
