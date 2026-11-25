'use client';

import {
  type AuctionDto,
  type AuctionInputWire,
  AUCTION_TYPE_LABEL,
  type AuctionType,
  fromDateTimeLocal,
  parseEuroInput,
} from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Field, invalidProps } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';
import { cn } from '@/lib/utils';

/** Form state as text, exactly as shown in the inputs. */
export interface AuctionFormValues {
  type: AuctionType;
  startingPrice: string;
  bidIncrement: string;
  priceDecrement: string;
  floorPrice: string;
  stepDurationSec: string;
  switchToAscendingOnAccept: boolean;
  startsAt: string;
  endsAt: string;
  extensionWindowSec: string;
  extensionSec: string;
  registrationDeadline: string;
  deposit: string;
  preemptionEnabled: boolean;
  preemptionWindowSec: string;
  courtApprovalRef: string;
}

const MONEY_HINT = 'Vnesite znesek, npr. 185.000,00.';

export function AuctionForm({
  lotId,
  auctionId,
  initial,
}: {
  lotId: string;
  /** Set when editing an existing draft. */
  auctionId?: string;
  initial: AuctionFormValues;
}) {
  const router = useRouter();
  const [type, setType] = useState<AuctionType>(initial.type);
  const [switchToAscending, setSwitchToAscending] = useState(initial.switchToAscendingOnAccept);
  const [preemption, setPreemption] = useState(initial.preemptionEnabled);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ascendingPhase = type === 'ASCENDING' || switchToAscending;

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const clientErrors: Record<string, string> = {};

    /** Euro text -> cents string; '' -> null; invalid -> field error. */
    const money = (input: string, field: string, required = false): string | null => {
      const text = textField(form, input).trim();
      if (text === '') {
        if (required) clientErrors[field] = 'Polje je obvezno.';
        return null;
      }
      const cents = parseEuroInput(text);
      if (cents === null) {
        clientErrors[field] = MONEY_HINT;
        return null;
      }
      return cents.toString();
    };
    const instant = (input: string, field: string, required = false): string | null => {
      const text = textField(form, input);
      if (text === '') {
        if (required) clientErrors[field] = 'Polje je obvezno.';
        return null;
      }
      const date = fromDateTimeLocal(text);
      if (!date) {
        clientErrors[field] = 'Neveljaven datum in ura.';
        return null;
      }
      return date.toISOString();
    };
    const int = (input: string, field: string): number | null => {
      const text = textField(form, input).trim();
      if (text === '') return null;
      if (!/^\d{1,6}$/.test(text)) {
        clientErrors[field] = 'Vnesite celo število.';
        return null;
      }
      return Number(text);
    };

    const startingPriceCents = money('startingPrice', 'startingPriceCents', true);
    const startsAt = instant('startsAt', 'startsAt', true);
    const body: Partial<AuctionInputWire> = {
      type,
      bidIncrementCents: ascendingPhase ? money('bidIncrement', 'bidIncrementCents') : null,
      priceDecrementCents:
        type === 'DESCENDING' ? money('priceDecrement', 'priceDecrementCents') : null,
      floorPriceCents: type === 'DESCENDING' ? money('floorPrice', 'floorPriceCents') : null,
      stepDurationSec: type === 'DESCENDING' ? int('stepDurationSec', 'stepDurationSec') : null,
      switchToAscendingOnAccept: type === 'DESCENDING' && switchToAscending,
      endsAt: type === 'ASCENDING' ? instant('endsAt', 'endsAt') : null,
      registrationDeadline: instant('registrationDeadline', 'registrationDeadline'),
      depositCents: money('deposit', 'depositCents'),
      preemptionEnabled: preemption,
      courtApprovalRef: textField(form, 'courtApprovalRef'),
    };
    if (ascendingPhase) {
      const window = int('extensionWindowSec', 'extensionWindowSec');
      const extension = int('extensionSec', 'extensionSec');
      if (window !== null) body.extensionWindowSec = window;
      if (extension !== null) body.extensionSec = extension;
    }
    if (preemption) {
      const window = int('preemptionWindowSec', 'preemptionWindowSec');
      if (window !== null) body.preemptionWindowSec = window;
    }

    if (Object.keys(clientErrors).length > 0 || !startingPriceCents || !startsAt) {
      setErrors(clientErrors);
      setMessage('Podatki niso veljavni. Preverite označena polja.');
      return;
    }

    setPending(true);
    setMessage(null);
    const payload = { ...body, startingPriceCents, startsAt };
    const result = auctionId
      ? await apiJson<AuctionDto>('PUT', `/api/auctions/${auctionId}`, payload)
      : await apiJson<AuctionDto>('POST', `/api/lots/${lotId}/auctions`, payload);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fields);
      setMessage(result.message);
      return;
    }
    router.push(`/upravitelj/drazbe/${result.data.id}`);
    router.refresh();
  }

  const text = (
    name: keyof AuctionFormValues,
    field: string,
    label: string,
    extra: {
      hint?: string;
      placeholder?: string;
      required?: boolean;
      type?: string;
      inputMode?: 'decimal' | 'numeric';
    } = {},
  ) => (
    <Field
      id={name}
      label={label}
      error={errors[field]}
      hint={extra.hint}
      required={extra.required ?? false}
    >
      <Input
        id={name}
        name={name}
        type={extra.type ?? 'text'}
        inputMode={extra.inputMode}
        defaultValue={String(initial[name])}
        placeholder={extra.placeholder}
        {...invalidProps(name, errors[field])}
      />
    </Field>
  );
  const eur = (
    name: keyof AuctionFormValues,
    field: string,
    label: string,
    hint?: string,
    required = false,
  ) =>
    text(name, field, label, {
      ...(hint ? { hint } : {}),
      placeholder: '0,00',
      inputMode: 'decimal',
      required,
    });
  const secs = (name: keyof AuctionFormValues, field: string, label: string, hint?: string) =>
    text(name, field, label, { ...(hint ? { hint } : {}), inputMode: 'numeric' });
  const dateTime = (
    name: keyof AuctionFormValues,
    field: string,
    label: string,
    hint?: string,
    required = false,
  ) => text(name, field, label, { ...(hint ? { hint } : {}), type: 'datetime-local', required });

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-8" noValidate>
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Vrsta dražbe</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['ASCENDING', 'DESCENDING'] as const).map((t) => (
            <label
              key={t}
              htmlFor={`type-${t}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
                type === t && 'border-primary ring-1 ring-primary',
              )}
            >
              <input
                id={`type-${t}`}
                type="radio"
                name="type"
                className="mt-0.5"
                checked={type === t}
                onChange={() => {
                  setType(t);
                }}
              />
              <span>
                <span className="font-medium">{AUCTION_TYPE_LABEL[t]}</span>
                <span className="block text-xs text-muted-foreground">
                  {t === 'ASCENDING'
                    ? 'Dražitelji višajo ponudbe; zmaga najvišja ponudba ob izteku časa.'
                    : 'Cena se v korakih znižuje; zmaga prvi dražitelj, ki sprejme trenutno ceno.'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">Cene</h2>
        {eur('startingPrice', 'startingPriceCents', 'Izklicna cena (EUR)', undefined, true)}
        {eur('deposit', 'depositCents', 'Varščina (EUR)', 'Prazno = 10 % izklicne cene.')}
        {type === 'DESCENDING' && (
          <>
            {eur(
              'floorPrice',
              'floorPriceCents',
              'Najnižja cena (EUR)',
              'Pod to ceno se izklicna cena ne zniža.',
              true,
            )}
            {eur(
              'priceDecrement',
              'priceDecrementCents',
              'Korak zniževanja (EUR)',
              undefined,
              true,
            )}
            {secs(
              'stepDurationSec',
              'stepDurationSec',
              'Trajanje koraka (sekunde)',
              'Čas, po katerem se cena zniža za en korak.',
            )}
            <label
              className="flex items-start gap-2 self-center text-sm"
              htmlFor="switchToAscendingOnAccept"
            >
              <input
                id="switchToAscendingOnAccept"
                type="checkbox"
                className="mt-0.5 size-4"
                checked={switchToAscending}
                onChange={(e) => {
                  setSwitchToAscending(e.target.checked);
                }}
              />
              <span>
                Po prvem sprejemu cene nadaljuj z zviševanjem
                <span className="block text-xs text-muted-foreground">
                  Drugi dražitelji lahko sprejeto ceno še presežejo.
                </span>
              </span>
            </label>
          </>
        )}
        {ascendingPhase &&
          eur(
            'bidIncrement',
            'bidIncrementCents',
            'Korak draženja (EUR)',
            'Najmanjši znesek, za katerega mora biti ponudba višja.',
            true,
          )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">
          Časovnica <span className="font-normal text-muted-foreground">(čas v Sloveniji)</span>
        </h2>
        {dateTime('startsAt', 'startsAt', 'Začetek dražbe', undefined, true)}
        {type === 'ASCENDING' && dateTime('endsAt', 'endsAt', 'Konec dražbe', undefined, true)}
        {dateTime(
          'registrationDeadline',
          'registrationDeadline',
          'Rok za prijavo in plačilo varščine',
          'Prazno = 2 delovna dneva pred začetkom dražbe.',
        )}
        {ascendingPhase && (
          <>
            {secs(
              'extensionWindowSec',
              'extensionWindowSec',
              'Okno podaljšanja (sekunde)',
              'Ponudba v tem času pred koncem podaljša dražbo. 0 = brez podaljševanja.',
            )}
            {secs(
              'extensionSec',
              'extensionSec',
              'Podaljšanje (sekunde)',
              'Za toliko se dražba podaljša od trenutka ponudbe.',
            )}
          </>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">Predkupna pravica in soglasje sodišča</h2>
        <label className="flex items-start gap-2 text-sm" htmlFor="preemptionEnabled">
          <input
            id="preemptionEnabled"
            type="checkbox"
            className="mt-0.5 size-4"
            checked={preemption}
            onChange={(e) => {
              setPreemption(e.target.checked);
            }}
          />
          <span>
            Na predmetu obstaja predkupna pravica
            <span className="block text-xs text-muted-foreground">
              Po koncu dražbe lahko predkupni upravičenec izenači najvišjo ponudbo.
            </span>
          </span>
        </label>
        {preemption ? (
          secs(
            'preemptionWindowSec',
            'preemptionWindowSec',
            'Rok za uveljavitev predkupne pravice (sekunde)',
          )
        ) : (
          <div />
        )}
        <div className="sm:col-span-2">
          {text('courtApprovalRef', 'courtApprovalRef', 'Sklep o soglasju sodišča k prodaji', {
            hint: 'Opravilna številka in datum sklepa. Obvezno pred objavo dražbe.',
            placeholder: 'St 1234/2026, sklep z dne 1. 2. 2027',
          })}
        </div>
      </section>

      {message && <Alert variant="destructive">{message}</Alert>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Shranjevanje …' : auctionId ? 'Shrani osnutek' : 'Ustvari osnutek dražbe'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            router.back();
          }}
        >
          Prekliči
        </Button>
      </div>
    </form>
  );
}
