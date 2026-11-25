'use client';

import {
  centsToInput,
  fromDateTimeLocal,
  parseEuroInput,
  SALE_STEP_ACTION_LABEL,
  type SaleStepValue,
  toDateTimeLocal,
} from '@domik/shared';
import { type SubmitEvent, useState } from 'react';
import { Field } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiJson, apiUpload } from '@/lib/api-client';
import { textField } from '@/lib/form';
import { errorText, useAction } from './use-action';

export interface TrusteeSalePanelProps {
  auctionId: string;
  status: string;
  hasContract: boolean;
  buyerSigned: boolean;
  downPaymentCents: string;
  downPaymentDays: number;
  priceDays: number;
  nextSteps: SaleStepValue[];
  /** A deadline has passed and the buyer has not performed: default may be declared. */
  canDeclareDefault: boolean;
}

const NEEDS_REFERENCE: Partial<Record<SaleStepValue, string>> = {
  TRANSFER_ORDER_ISSUED: 'Opravilna številka sklepa',
  REGISTERED: 'Številka zadeve v zemljiški knjigi (Dn)',
};

function ErrorAlert({ error }: { error: ReturnType<typeof useAction>['error'] }) {
  return error ? <Alert variant="destructive">{errorText(error)}</Alert> : null;
}

/** Contract terms + generation. */
function ContractForm(p: TrusteeSalePanelProps) {
  const { pending, error, setError, run } = useAction();

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const downPayment = parseEuroInput(textField(form, 'downPayment'));
    if (downPayment === null) {
      setError({ message: '', fields: { downPayment: 'Neveljaven znesek.' } });
      return;
    }
    void run(() =>
      apiJson('POST', `/api/auctions/${p.auctionId}/contract`, {
        downPaymentCents: downPayment.toString(),
        downPaymentDays: textField(form, 'downPaymentDays'),
        priceDays: textField(form, 'priceDays'),
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4">
      <div className="font-medium">Prodajna pogodba</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          id="downPayment"
          label="Ara (€, vključno z varščino)"
          error={error?.fields.downPayment}
        >
          <Input
            id="downPayment"
            name="downPayment"
            inputMode="decimal"
            defaultValue={centsToInput(p.downPaymentCents)}
          />
        </Field>
        <Field
          id="downPaymentDays"
          label="Rok za aro (dni po podpisu)"
          error={error?.fields.downPaymentDays}
        >
          <Input
            id="downPaymentDays"
            name="downPaymentDays"
            type="number"
            min={1}
            max={365}
            defaultValue={p.downPaymentDays}
          />
        </Field>
        <Field
          id="priceDays"
          label="Rok za kupnino (dni po podpisu)"
          error={error?.fields.priceDays}
        >
          <Input
            id="priceDays"
            name="priceDays"
            type="number"
            min={1}
            max={365}
            defaultValue={p.priceDays}
          />
        </Field>
      </div>
      {error &&
        !error.fields.downPayment &&
        !error.fields.priceDays &&
        !error.fields.downPaymentDays && <ErrorAlert error={error} />}
      <div>
        <Button type="submit" disabled={pending} variant={p.hasContract ? 'outline' : 'default'}>
          {pending
            ? 'Pripravljam …'
            : p.hasContract
              ? 'Pripravi pogodbo znova'
              : 'Pripravi pogodbo'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pogodba se izdela iz predloge z vsemi podatki postopka, predmeta, kupca in zapisnika. Kupec
        prejme obvestilo, da jo lahko prenese in podpiše.
      </p>
    </form>
  );
}

function SignedUpload({ auctionId }: { auctionId: string }) {
  const { pending, error, run } = useAction();
  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(() => apiUpload(`/api/auctions/${auctionId}/contract/signed`, form));
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-2 rounded-lg border p-4">
      <div className="font-medium">Sopodpis upravitelja</div>
      <p className="text-sm text-muted-foreground">
        Prenesite pogodbo, ki jo je podpisal kupec, jo podpišite s svojim kvalificiranim
        elektronskim podpisom (ne da bi jo spreminjali) in jo naložite. Preverita se oba podpisa.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="file"
          type="file"
          accept="application/pdf"
          required
          aria-label="Podpisana pogodba"
          className="max-w-xs"
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Preverjam podpise …' : 'Naloži podpisano pogodbo'}
        </Button>
      </div>
      <ErrorAlert error={error} />
    </form>
  );
}

function PaperFallback({ auctionId }: { auctionId: string }) {
  const { pending, error, setError, run } = useAction();
  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const signedAt = fromDateTimeLocal(textField(form, 'signedAtLocal'));
    if (!signedAt) {
      setError({ message: '', fields: { signedAt: 'Vnesite datum podpisa.' } });
      return;
    }
    form.delete('signedAtLocal');
    form.set('signedAt', signedAt.toISOString());
    void run(() => apiUpload(`/api/auctions/${auctionId}/contract/paper`, form));
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Pogodba je bila podpisana na papirju
      </summary>
      <form onSubmit={onSubmit} className="mt-3 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="signedAtLocal" label="Datum in ura podpisa" error={error?.fields.signedAt}>
            <Input
              id="signedAtLocal"
              name="signedAtLocal"
              type="datetime-local"
              required
              defaultValue={toDateTimeLocal(new Date())}
            />
          </Field>
          <Field id="paperFile" label="Skenirana podpisana pogodba" error={error?.fields.file}>
            <Input
              id="paperFile"
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </Field>
        </div>
        {error && !error.fields.signedAt && !error.fields.file && <ErrorAlert error={error} />}
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? 'Shranjujem …' : 'Shrani podpis na papirju'}
          </Button>
        </div>
      </form>
    </details>
  );
}

function StepForm({ auctionId, step }: { auctionId: string; step: SaleStepValue }) {
  const { pending, error, setError, run } = useAction();
  const reference = NEEDS_REFERENCE[step];
  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const at = fromDateTimeLocal(textField(form, 'at'));
    if (!at) {
      setError({ message: '', fields: { at: 'Vnesite datum.' } });
      return;
    }
    void run(() =>
      apiJson('POST', `/api/auctions/${auctionId}/sale/steps`, {
        step,
        at: at.toISOString(),
        ...(reference ? { reference: textField(form, 'reference') } : {}),
      }),
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4">
      <div className="font-medium">{SALE_STEP_ACTION_LABEL[step]}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`at-${step}`} label="Datum" error={error?.fields.at}>
          <Input
            id={`at-${step}`}
            name="at"
            type="datetime-local"
            required
            defaultValue={toDateTimeLocal(new Date())}
          />
        </Field>
        {reference && (
          <Field id={`ref-${step}`} label={reference} error={error?.fields.reference} required>
            <Input id={`ref-${step}`} name="reference" maxLength={100} />
          </Field>
        )}
      </div>
      {error && !error.fields.at && !error.fields.reference && <ErrorAlert error={error} />}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Shranjujem …' : 'Potrdi'}
        </Button>
      </div>
    </form>
  );
}

function DefaultAction({ auctionId }: { auctionId: string }) {
  const { pending, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <>
      <div>
        <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
          Ugotovi neizpolnitev kupca
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title="Neizpolnitev obveznosti kupca"
        confirmLabel="Ugotovi neizpolnitev"
        pending={pending}
        confirmDisabled={reason.trim().length < 5}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          void run(() =>
            apiJson('POST', `/api/auctions/${auctionId}/sale/default`, { reason }),
          ).then((r) => {
            if (r) setOpen(false);
          });
        }}
      >
        <p className="text-sm">
          Prodaja bo označena kot neizpolnjena, varščina kupca pa zapade v korist stečajne mase.
          Kupec prejme obvestilo. Tega ni mogoče razveljaviti.
        </p>
        <Field id="defaultReason" label="Razlog" error={error?.fields.reason} required>
          <Textarea
            id="defaultReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </Field>
        {error && !error.fields.reason && <ErrorAlert error={error} />}
      </ConfirmDialog>
    </>
  );
}

/** Trustee actions on the sale: contract, signatures, payments, transfer, default. */
export function TrusteeSalePanel(p: TrusteeSalePanelProps) {
  return (
    <div className="grid gap-3">
      {p.status === 'AWAITING_CONTRACT' && (
        <>
          {!p.buyerSigned && <ContractForm {...p} />}
          {p.buyerSigned && <SignedUpload auctionId={p.auctionId} />}
          <PaperFallback auctionId={p.auctionId} />
        </>
      )}
      {p.nextSteps.map((step) => (
        <StepForm key={step} auctionId={p.auctionId} step={step} />
      ))}
      {p.canDeclareDefault && <DefaultAction auctionId={p.auctionId} />}
    </div>
  );
}
