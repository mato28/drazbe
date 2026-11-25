'use client';

import { type CaseDto } from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Field, invalidProps } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';

const FIELDS = [
  { name: 'court', label: 'Sodišče', placeholder: 'Okrožno sodišče v Ljubljani' },
  { name: 'caseNumber', label: 'Opravilna številka', placeholder: 'St 1234/2026' },
  { name: 'debtorName', label: 'Stečajni dolžnik', placeholder: 'Podjetje d.o.o. - v stečaju' },
  { name: 'debtorTaxId', label: 'Davčna številka dolžnika', placeholder: '12345679' },
  {
    name: 'debtorAddress',
    label: 'Naslov sedeža dolžnika',
    placeholder: 'Šmartinska cesta 152',
    hint: 'Izpiše se kot naslov prejemnika na plačilnem nalogu za varščino.',
  },
  { name: 'debtorCity', label: 'Pošta in kraj dolžnika', placeholder: '1000 Ljubljana' },
  {
    name: 'estateIban',
    label: 'IBAN fiduciarnega računa stečajne mase',
    placeholder: 'SI56 0510 0801 2340 041',
    hint: 'Na ta račun dražitelji plačajo varščino in kupnino.',
  },
  { name: 'estateBank', label: 'Banka', placeholder: 'Banka d.d.' },
] as const;

export function CaseForm({ initial, disabled }: { initial?: CaseDto; disabled?: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(FIELDS.map((f) => [f.name, textField(form, f.name)]));
    setPending(true);
    setMessage(null);
    const result = initial
      ? await apiJson<CaseDto>('PUT', `/api/cases/${initial.id}`, body)
      : await apiJson<CaseDto>('POST', '/api/cases', body);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fields);
      setMessage({ kind: 'error', text: result.message });
      return;
    }
    setErrors({});
    if (initial) {
      setMessage({ kind: 'success', text: 'Spremembe so shranjene.' });
      router.refresh();
    } else {
      router.push(`/upravitelj/postopki/${result.data.id}`);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2" noValidate>
      {FIELDS.map((f) => (
        <Field
          key={f.name}
          id={f.name}
          label={f.label}
          required
          error={errors[f.name]}
          hint={'hint' in f ? f.hint : undefined}
        >
          <Input
            id={f.name}
            name={f.name}
            defaultValue={initial?.[f.name] ?? ''}
            placeholder={f.placeholder}
            disabled={disabled}
            {...invalidProps(f.name, errors[f.name])}
          />
        </Field>
      ))}
      {message && (
        <Alert
          variant={message.kind === 'error' ? 'destructive' : 'success'}
          className="sm:col-span-2"
        >
          {message.text}
        </Alert>
      )}
      {!disabled && (
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Shranjevanje …' : initial ? 'Shrani spremembe' : 'Ustvari postopek'}
          </Button>
        </div>
      )}
    </form>
  );
}
