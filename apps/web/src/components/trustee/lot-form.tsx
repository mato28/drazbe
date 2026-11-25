'use client';

import {
  centsToInput,
  type LotDto,
  parseEuroInput,
  PROPERTY_KIND_LABEL,
  PROPERTY_KINDS,
} from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';
import { Field, invalidProps } from '@/components/form/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';

const TEXT_FIELDS = [
  {
    name: 'cadastralMunicipality',
    label: 'Katastrska občina (k.o.)',
    placeholder: '1736 Bežigrad',
  },
  { name: 'parcelNumber', label: 'Parcelna številka', placeholder: '1234/5' },
  { name: 'buildingId', label: 'Številka stavbe', placeholder: '678' },
  { name: 'partId', label: 'Številka dela stavbe', placeholder: '12' },
  { name: 'idZnak', label: 'ID znak', placeholder: '1736-678-12' },
  { name: 'landUse', label: 'Namenska raba', placeholder: 'Območje stanovanj (SS)' },
] as const;

export function LotForm({
  caseId,
  initial,
  disabled,
}: {
  caseId: string;
  initial?: LotDto;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const clientErrors: Record<string, string> = {};

    const appraisalText = textField(form, 'appraisalValue').trim();
    const appraisal = appraisalText === '' ? null : parseEuroInput(appraisalText);
    if (appraisalText !== '' && appraisal === null) {
      clientErrors.appraisalValueCents = 'Vnesite znesek, npr. 185.000,00.';
    }
    const areaText = textField(form, 'areaM2').trim().replace(',', '.');
    if (areaText !== '' && !/^\d{1,10}(\.\d{1,2})?$/.test(areaText)) {
      clientErrors.areaM2 = 'Vnesite površino, npr. 58,40.';
    }
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setMessage({ kind: 'error', text: 'Podatki niso veljavni. Preverite označena polja.' });
      return;
    }

    const body = {
      title: textField(form, 'title'),
      propertyKind: textField(form, 'propertyKind'),
      municipality: textField(form, 'municipality'),
      description: textField(form, 'description'),
      address: textField(form, 'address'),
      encumbrancesText: textField(form, 'encumbrancesText'),
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.name, textField(form, f.name)])),
      areaM2: areaText === '' ? null : areaText,
      appraisalValueCents: appraisal === null ? null : appraisal.toString(),
      isAgricultural: form.get('isAgricultural') === 'on',
    };

    setPending(true);
    setMessage(null);
    const result = initial
      ? await apiJson<LotDto>('PUT', `/api/lots/${initial.id}`, body)
      : await apiJson<LotDto>('POST', `/api/cases/${caseId}/lots`, body);
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
      router.push(`/upravitelj/predmeti/${result.data.id}`);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field id="title" label="Naziv" required error={errors.title} className="sm:col-span-2">
        <Input
          id="title"
          name="title"
          defaultValue={initial?.title ?? ''}
          placeholder="Dvosobno stanovanje, Ljubljana – Bežigrad"
          disabled={disabled}
          {...invalidProps('title', errors.title)}
        />
      </Field>
      <Field id="propertyKind" label="Vrsta nepremičnine" required error={errors.propertyKind}>
        <NativeSelect
          id="propertyKind"
          name="propertyKind"
          defaultValue={initial?.propertyKind ?? ''}
          disabled={disabled}
          {...invalidProps('propertyKind', errors.propertyKind)}
        >
          <option value="" disabled>
            Izberite …
          </option>
          {PROPERTY_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROPERTY_KIND_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="municipality"
        label="Kraj"
        required
        error={errors.municipality}
        hint="Javno prikazan kraj nepremičnine, npr. Ljubljana."
      >
        <Input
          id="municipality"
          name="municipality"
          defaultValue={initial?.municipality ?? ''}
          placeholder="Ljubljana"
          disabled={disabled}
          {...invalidProps('municipality', errors.municipality)}
        />
      </Field>
      <Field id="description" label="Opis" error={errors.description} className="sm:col-span-2">
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ''}
          disabled={disabled}
        />
      </Field>
      <Field id="address" label="Naslov" error={errors.address} className="sm:col-span-2">
        <Input
          id="address"
          name="address"
          defaultValue={initial?.address ?? ''}
          placeholder="Primerna ulica 10, 1000 Ljubljana"
          disabled={disabled}
        />
      </Field>

      {TEXT_FIELDS.map((f) => (
        <Field key={f.name} id={f.name} label={f.label} error={errors[f.name]}>
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

      <Field id="areaM2" label="Površina (m²)" error={errors.areaM2}>
        <Input
          id="areaM2"
          name="areaM2"
          inputMode="decimal"
          defaultValue={initial?.areaM2?.replace('.', ',') ?? ''}
          placeholder="58,40"
          disabled={disabled}
          {...invalidProps('areaM2', errors.areaM2)}
        />
      </Field>
      <Field
        id="appraisalValue"
        label="Ocenjena vrednost (EUR)"
        error={errors.appraisalValueCents}
        hint="Po cenitvenem poročilu."
      >
        <Input
          id="appraisalValue"
          name="appraisalValue"
          inputMode="decimal"
          defaultValue={
            initial?.appraisalValueCents ? centsToInput(initial.appraisalValueCents) : ''
          }
          placeholder="185.000,00"
          disabled={disabled}
          {...invalidProps('appraisalValue', errors.appraisalValueCents)}
        />
      </Field>

      <Field
        id="encumbrancesText"
        label="Bremena in omejitve"
        error={errors.encumbrancesText}
        className="sm:col-span-2"
        hint="Hipoteke, služnosti, najemna razmerja, zaznambe …"
      >
        <Textarea
          id="encumbrancesText"
          name="encumbrancesText"
          rows={3}
          defaultValue={initial?.encumbrancesText ?? ''}
          disabled={disabled}
        />
      </Field>

      <label className="flex items-start gap-2 text-sm sm:col-span-2" htmlFor="isAgricultural">
        <input
          id="isAgricultural"
          name="isAgricultural"
          type="checkbox"
          className="mt-0.5 size-4"
          defaultChecked={initial?.isAgricultural ?? false}
          disabled={disabled}
        />
        <span>
          Kmetijsko zemljišče, gozd ali kmetija
          <span className="block text-xs text-muted-foreground">
            Prodaja kmetijskih zemljišč poteka po posebnem postopku (ZKZ) in je ta različica
            platforme ne podpira – dražbe za tak predmet ne bo mogoče objaviti.
          </span>
        </span>
      </label>

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
            {pending ? 'Shranjevanje …' : initial ? 'Shrani spremembe' : 'Ustvari predmet prodaje'}
          </Button>
        </div>
      )}
    </form>
  );
}
