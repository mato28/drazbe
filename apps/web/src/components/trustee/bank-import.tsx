'use client';

import { formatCents } from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJson, apiUpload } from '@/lib/api-client';

interface Tx {
  line: number;
  bookingDate: string | null;
  amountCents: string;
  payerName: string;
  reference: string | null;
  description: string;
  bankReference: string | null;
}
interface Match {
  registrationId: string;
  confidence: 'EXACT' | 'NAME_MISMATCH' | 'AMOUNT_MISMATCH';
  transaction: Tx;
  pseudonym: string;
  bidderName: string;
  paymentReference: string;
  depositCents: string;
  lotTitle: string;
  caseNumber: string;
}
interface Proposal {
  transactionCount: number;
  matches: Match[];
  unmatched: Tx[];
}
interface ConfirmResult {
  confirmed: string[];
  skipped: { registrationId: string; reason: string }[];
}

const CONFIDENCE = {
  EXACT: { label: 'Ujemanje', variant: 'success' },
  NAME_MISMATCH: { label: 'Drug plačnik', variant: 'warning' },
  AMOUNT_MISMATCH: { label: 'Napačen znesek', variant: 'destructive' },
} as const;

const slDate = (iso: string | null): string =>
  iso ? iso.split('-').reverse().map(Number).join('. ') : '—';

/** Upload a statement -> review the proposed matches -> confirm the ticked ones. */
export function BankImport() {
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onUpload(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);
    const res = await apiUpload<Proposal>(
      '/api/bank-statements/proposals',
      new FormData(e.currentTarget),
    );
    setPending(false);
    if (!res.ok) {
      setProposal(null);
      setError(res.fields.file ?? res.message);
      return;
    }
    setProposal(res.data);
    // Only exact matches are pre-ticked; the trustee decides about the rest.
    setSelected(
      new Set(
        res.data.matches.filter((m) => m.confidence === 'EXACT').map((m) => m.registrationId),
      ),
    );
  }

  async function confirm() {
    if (!proposal) return;
    setPending(true);
    setError(null);
    const res = await apiJson<ConfirmResult>('POST', '/api/bank-statements/confirmations', {
      matches: proposal.matches
        .filter((m) => selected.has(m.registrationId))
        .map((m) => ({
          registrationId: m.registrationId,
          amountCents: m.transaction.amountCents,
          payerName: m.transaction.payerName,
          bookingDate: m.transaction.bookingDate,
          bankReference: m.transaction.bankReference,
        })),
    });
    setPending(false);
    if (!res.ok) {
      setError(Object.values(res.fields)[0] ?? res.message);
      return;
    }
    setResult(res.data);
    setProposal(null);
    router.refresh();
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="grid gap-6">
      <form
        onSubmit={(e) => void onUpload(e)}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-4"
      >
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="file">
          Bančni izpisek (camt.053 XML ali CSV)
          <Input
            id="file"
            name="file"
            type="file"
            accept=".xml,.csv,text/xml,application/xml,text/csv"
            required
            className="max-w-sm"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Branje …' : 'Preberi izpisek'}
        </Button>
      </form>

      {error && <Alert variant="destructive">{error}</Alert>}

      {result && (
        <Alert variant={result.skipped.length > 0 ? 'warning' : 'success'}>
          <p className="font-medium">Potrjenih plačil varščine: {result.confirmed.length}.</p>
          {result.skipped.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.skipped.map((s) => (
                <li key={s.registrationId}>{s.reason}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {proposal && (
        <>
          <p className="text-sm text-muted-foreground">
            Prebranih prilivov: {proposal.transactionCount}. Predlaganih ujemanj z odprtimi
            varščinami: {proposal.matches.length}. Izpisek se ne shrani.
          </p>

          {proposal.matches.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">
                      <span className="sr-only">Izberi</span>
                    </th>
                    <th className="px-3 py-2 font-medium">Plačilo</th>
                    <th className="px-3 py-2 font-medium">Dražitelj in dražba</th>
                    <th className="px-3 py-2 font-medium">Sklic</th>
                    <th className="px-3 py-2 font-medium">Ocena</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {proposal.matches.map((m) => {
                    const blocked = m.confidence === 'AMOUNT_MISMATCH';
                    return (
                      <tr key={m.registrationId} className={blocked ? 'bg-muted/30' : undefined}>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            className="mt-1 size-4"
                            aria-label={`Potrdi plačilo ${m.pseudonym}`}
                            checked={selected.has(m.registrationId)}
                            disabled={blocked}
                            onChange={() => {
                              toggle(m.registrationId);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">
                            {formatCents(m.transaction.amountCents)}
                          </div>
                          <div className="text-muted-foreground">
                            {m.transaction.payerName || 'neznan plačnik'} ·{' '}
                            {slDate(m.transaction.bookingDate)}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium">
                            {m.bidderName} ({m.pseudonym})
                          </div>
                          <div className="text-muted-foreground">
                            {m.lotTitle} · {m.caseNumber} · varščina {formatCents(m.depositCents)}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top font-mono whitespace-nowrap">
                          {m.paymentReference}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge variant={CONFIDENCE[m.confidence].variant}>
                            {CONFIDENCE[m.confidence].label}
                          </Badge>
                          {blocked && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Ni mogoče potrditi kot plačano.
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <Button disabled={pending || selected.size === 0} onClick={() => void confirm()}>
              Potrdi izbrana plačila ({selected.size})
            </Button>
          </div>

          {proposal.unmatched.length > 0 && (
            <details className="rounded-lg border px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Prilivi brez ujemanja ({proposal.unmatched.length})
              </summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {proposal.unmatched.map((t) => (
                  <li key={`${t.line}-${t.bankReference ?? ''}`}>
                    {slDate(t.bookingDate)} · {formatCents(t.amountCents)} ·{' '}
                    {t.payerName || 'neznan plačnik'}
                    {t.reference ? ` · ${t.reference}` : ''}{' '}
                    {t.description ? `· ${t.description}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
