'use client';

import {
  type BidderProfileDto,
  BIDDER_TYPE_LABEL,
  BIDDER_TYPES,
  type BidderType,
} from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useRef, useState } from 'react';
import { Field, invalidProps } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';
import { useVatAutofill } from '@/lib/use-vat-autofill';
import { cn } from '@/lib/utils';

export function ProfileForm({
  initial,
  defaultName,
  defaultPhone,
  locked,
}: {
  initial: BidderProfileDto | null;
  defaultName: string;
  defaultPhone: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<BidderType>(initial?.type ?? 'PERSON');
  const [isRepresentative, setIsRepresentative] = useState(
    initial?.actsAsLegalRepresentative ?? true,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const vat = useVatAutofill(formRef, { companyName: 'name', address: 'address' });

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const company = type === 'COMPANY';
    setPending(true);
    setMessage(null);
    const result = await apiJson<BidderProfileDto>('PUT', '/api/bidder/profile', {
      type,
      fullName: textField(form, 'fullName'),
      taxId: textField(form, 'taxId'),
      address: textField(form, 'address'),
      phone: textField(form, 'phone'),
      companyName: company ? textField(form, 'companyName') : null,
      companyRegNo: company ? textField(form, 'companyRegNo') : null,
      representativeName: company ? textField(form, 'representativeName') : null,
      actsAsLegalRepresentative: company ? isRepresentative : true,
    });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fields);
      setMessage({ kind: 'error', text: result.message });
      return;
    }
    setErrors({});
    setMessage({ kind: 'success', text: 'Podatki so shranjeni.' });
    router.refresh();
  }

  const input = (
    name: string,
    label: string,
    value: string,
    extra: {
      placeholder?: string;
      hint?: string | null;
      type?: string;
      className?: string;
      onBlur?: (e: { currentTarget: HTMLInputElement }) => void;
    } = {},
  ) => (
    <Field
      id={name}
      label={label}
      required
      error={errors[name]}
      hint={extra.hint ?? undefined}
      className={extra.className}
    >
      <Input
        id={name}
        name={name}
        type={extra.type ?? 'text'}
        defaultValue={value}
        placeholder={extra.placeholder}
        disabled={locked}
        onBlur={extra.onBlur}
        {...invalidProps(name, errors[name])}
      />
    </Field>
  );

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void onSubmit(e)}
      className="grid gap-4 sm:grid-cols-2"
      noValidate
    >
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2" disabled={locked}>
        <legend className="sr-only">Vrsta dražitelja</legend>
        {BIDDER_TYPES.map((t) => (
          <label
            key={t}
            htmlFor={`type-${t}`}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium',
              type === t && 'border-primary ring-1 ring-primary',
            )}
          >
            <input
              id={`type-${t}`}
              type="radio"
              name="type"
              checked={type === t}
              onChange={() => {
                setType(t);
              }}
            />
            {BIDDER_TYPE_LABEL[t]}
          </label>
        ))}
      </fieldset>

      {type === 'COMPANY' && (
        <>
          {input('companyName', 'Naziv pravne osebe', initial?.companyName ?? '', {
            placeholder: 'Podjetje d.o.o.',
            className: 'sm:col-span-2',
          })}
          {input('companyRegNo', 'Matična številka', initial?.companyRegNo ?? '', {
            placeholder: '1234567000',
          })}
          {input('representativeName', 'Zakoniti zastopnik', initial?.representativeName ?? '')}
        </>
      )}

      {input(
        'fullName',
        type === 'COMPANY' ? 'Ime in priimek osebe, ki bo dražila' : 'Ime in priimek',
        initial?.fullName ?? defaultName,
      )}
      {input(
        'taxId',
        type === 'COMPANY' ? 'Davčna številka pravne osebe' : 'Davčna številka',
        initial?.taxId ?? '',
        type === 'COMPANY'
          ? {
              placeholder: '12345679',
              hint: vat.hint ?? 'Naziv in sedež izpolnimo samodejno iz registra VIES.',
              onBlur: vat.onBlur,
            }
          : { placeholder: '12345679' },
      )}
      {input(
        'address',
        type === 'COMPANY' ? 'Sedež' : 'Naslov stalnega prebivališča',
        initial?.address ?? '',
        {
          placeholder: 'Slovenska cesta 1, 1000 Ljubljana',
          className: 'sm:col-span-2',
        },
      )}
      {input('phone', 'Telefonska številka', initial?.phone ?? defaultPhone, {
        type: 'tel',
        placeholder: '041 123 456',
      })}

      {type === 'COMPANY' && (
        <label
          className="flex items-start gap-2 self-end pb-2 text-sm"
          htmlFor="actsAsLegalRepresentative"
        >
          <input
            id="actsAsLegalRepresentative"
            type="checkbox"
            className="mt-0.5 size-4"
            checked={isRepresentative}
            disabled={locked}
            onChange={(e) => {
              setIsRepresentative(e.target.checked);
            }}
          />
          <span>
            Oseba, ki bo dražila, je zakoniti zastopnik
            <span className="block text-xs text-muted-foreground">
              Če ni, spodaj naložite pooblastilo zakonitega zastopnika.
            </span>
          </span>
        </label>
      )}

      {message && (
        <Alert
          variant={message.kind === 'error' ? 'destructive' : 'success'}
          className="sm:col-span-2"
        >
          {message.text}
        </Alert>
      )}
      {!locked && (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Shranjevanje …' : 'Shrani podatke'}
          </Button>
        </div>
      )}
    </form>
  );
}
