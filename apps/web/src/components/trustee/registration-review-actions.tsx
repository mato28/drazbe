'use client';

import {
  type DepositStatus,
  type RegistrationStatus,
  type VerificationStatus,
} from '@domik/shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, type SubmitEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiJson } from '@/lib/api-client';
import { textField } from '@/lib/form';

type Panel = 'identity-reject' | 'registration-reject' | null;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-3 rounded-xl border p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** All trustee decisions on one registration. The server enforces every rule again. */
export function RegistrationReviewActions({
  registrationId,
  identityStatus,
  identityNeedsReview,
  depositStatus,
  depositNote,
  registrationStatus,
  blockers,
  preemptionEnabled,
  isPreemptionHolder,
  preemptionRank,
  editable,
}: {
  registrationId: string;
  identityStatus: VerificationStatus;
  identityNeedsReview: boolean;
  depositStatus: DepositStatus;
  depositNote: string | null;
  registrationStatus: RegistrationStatus;
  blockers: string[];
  preemptionEnabled: boolean;
  isPreemptionHolder: boolean;
  preemptionRank: number | null;
  /** False once the auction is past the registration phase. */
  editable: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/registrations/${registrationId}`;

  async function run(path: string, body?: unknown) {
    setPending(true);
    setError(null);
    const result = await apiJson('POST', `${base}/${path}`, body);
    setPending(false);
    if (!result.ok) {
      setError(Object.values(result.fields)[0] ?? result.message);
      return;
    }
    setPanel(null);
    router.refresh();
  }

  const reasonForm = (path: string, label: string, toBody: (reason: string) => unknown) => (
    <form
      className="grid gap-2"
      onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        void run(path, toBody(textField(new FormData(e.currentTarget), 'reason')));
      }}
    >
      <Textarea
        name="reason"
        rows={3}
        required
        minLength={10}
        aria-label={label}
        placeholder={label}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          Potrdi zavrnitev
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPanel(null);
          }}
        >
          Nazaj
        </Button>
      </div>
    </form>
  );

  return (
    <div className="grid gap-4">
      {!editable && (
        <Alert variant="warning">
          Dražba ni več v fazi prijav, zato prijave ni mogoče spreminjati.
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="1. Identiteta">
          <p className="text-sm text-muted-foreground">
            Primerjajte podatke dražitelja z osebnim dokumentom (in pooblastilom, če je priloženo).
          </p>
          {identityNeedsReview && editable && (
            <>
              <div className="flex flex-wrap gap-2">
                {identityStatus !== 'VERIFIED' && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => void run('identity', { decision: 'VERIFIED' })}
                  >
                    Potrdi identiteto
                  </Button>
                )}
                {identityStatus !== 'REJECTED' && registrationStatus !== 'APPROVED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setPanel('identity-reject');
                    }}
                  >
                    Zavrni identiteto
                  </Button>
                )}
              </div>
              {panel === 'identity-reject' &&
                reasonForm('identity', 'Razlog zavrnitve (vidi ga dražitelj)', (reason) => ({
                  decision: 'REJECTED',
                  reason,
                }))}
            </>
          )}
        </Card>

        <Card title="2. Varščina">
          {depositStatus === 'PAID' ? (
            <>
              <p className="text-sm">{depositNote}</p>
              {editable && registrationStatus !== 'APPROVED' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  disabled={pending}
                  onClick={() => void run('deposit', { status: 'PENDING' })}
                >
                  Razveljavi potrditev plačila
                </Button>
              )}
            </>
          ) : (
            editable && (
              <form
                className="grid gap-2"
                onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  void run('deposit', {
                    status: 'PAID',
                    note: textField(new FormData(e.currentTarget), 'note'),
                  });
                }}
              >
                <Input
                  name="note"
                  aria-label="Opomba"
                  placeholder="Opomba, npr. izpisek 27. 11. 2026"
                  maxLength={500}
                />
                <Button type="submit" size="sm" className="w-fit" disabled={pending}>
                  Označi kot plačano
                </Button>
                <p className="text-xs text-muted-foreground">
                  Več plačil hkrati lahko potrdite z uvozom bančnega izpiska.
                </p>
              </form>
            )
          )}
        </Card>

        {preemptionEnabled && (
          <Card title="Predkupna pravica">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
                e.preventDefault();
                const rank = Number(textField(new FormData(e.currentTarget), 'rank'));
                void run('preemption', { isHolder: true, rank });
              }}
            >
              <label className="grid gap-1 text-sm" htmlFor="rank">
                Vrstni red upravičenca
                <Input
                  id="rank"
                  name="rank"
                  type="number"
                  min={1}
                  max={99}
                  required
                  defaultValue={preemptionRank ?? 1}
                  className="w-24"
                  disabled={!editable}
                />
              </label>
              {editable && (
                <>
                  <Button
                    type="submit"
                    size="sm"
                    variant={isPreemptionHolder ? 'outline' : 'default'}
                    disabled={pending}
                  >
                    {isPreemptionHolder
                      ? 'Spremeni vrstni red'
                      : 'Označi kot predkupnega upravičenca'}
                  </Button>
                  {isPreemptionHolder && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => void run('preemption', { isHolder: false })}
                    >
                      Odstrani
                    </Button>
                  )}
                </>
              )}
            </form>
            <p className="text-xs text-muted-foreground">
              Predkupni upravičenec lahko po koncu dražbe izenači najvišjo ponudbo.
            </p>
          </Card>
        )}

        <Card title="3. Odločitev o prijavi">
          {registrationStatus === 'APPROVED' ? (
            <p className="text-sm">Prijava je potrjena. Dražitelj lahko draži.</p>
          ) : blockers.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Vsi pogoji so izpolnjeni.</p>
          )}
          {editable && (
            <>
              <div className="flex flex-wrap gap-2">
                {registrationStatus !== 'APPROVED' && (
                  <Button
                    size="sm"
                    disabled={pending || blockers.length > 0}
                    onClick={() => void run('approve')}
                  >
                    Potrdi prijavo
                  </Button>
                )}
                {registrationStatus !== 'REJECTED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setPanel('registration-reject');
                    }}
                  >
                    Zavrni prijavo
                  </Button>
                )}
              </div>
              {panel === 'registration-reject' &&
                reasonForm('reject', 'Razlog zavrnitve (vidi ga dražitelj)', (reason) => ({
                  reason,
                }))}
            </>
          )}
        </Card>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
