'use client';

import {
  BID_KIND_LABEL,
  type BidResultDto,
  centsToInput,
  formatCents,
  type LiveAuctionStateDto,
  liveAuctionStateDtoSchema,
  parseEuroInput,
} from '@domik/shared';
import { CircleCheck, Radio, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiJson } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useServerClock } from './server-clock';

const timeFmt = new Intl.DateTimeFormat('sl-SI', {
  timeZone: 'Europe/Ljubljana',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${String(d)} ${d === 1 ? 'dan' : 'dni'} ${hms}` : hms;
}

/** What the big countdown is counting to in the current phase. */
function countdownTarget(s: LiveAuctionStateDto): { at: string; label: string } | null {
  switch (s.status) {
    case 'PUBLISHED':
    case 'REGISTRATION_CLOSED':
      return { at: s.startsAt, label: 'Do začetka dražbe' };
    case 'LIVE':
      if (s.mode === 'ASCENDING')
        return s.endsAt ? { at: s.endsAt, label: 'Do konca dražbe' } : null;
      if (!s.nextStepAt) return null;
      return s.nextPriceCents
        ? { at: s.nextStepAt, label: `Do znižanja na ${formatCents(s.nextPriceCents)}` }
        : { at: s.nextStepAt, label: 'Do konca dražbe (najnižja cena)' };
    case 'PREEMPTION':
      return s.preemptionEndsAt
        ? { at: s.preemptionEndsAt, label: 'Do izteka roka za predkupno pravico' }
        : null;
    default:
      return null;
  }
}

type Action =
  | { kind: 'bid'; amountCents: string; key: string }
  | { kind: 'accept'; amountCents: string; key: string }
  | { kind: 'match'; amountCents: string; key: string };

const ACTION_URL: Record<Action['kind'], string> = {
  bid: 'bids',
  accept: 'accept',
  match: 'preemption-match',
};

export function LiveAuction({
  initial,
  signedIn,
  signedInAs,
  loginHref,
}: {
  initial: LiveAuctionStateDto;
  signedIn: boolean;
  /** e.g. "upravitelj@domik.local (upravitelj)" — shown when this account cannot bid. */
  signedInAs: string | null;
  loginHref: string;
}) {
  const [state, setState] = useState(initial);
  const [connection, setConnection] = useState<'connecting' | 'open' | 'lost'>('connecting');
  const { now } = useServerClock(initial.serverTime);
  const auctionId = initial.auctionId;

  // Apply a snapshot unless a newer one is already shown (stream and fetches may interleave).
  const apply = useCallback((next: LiveAuctionStateDto) => {
    setState((cur) =>
      new Date(next.serverTime).getTime() >= new Date(cur.serverTime).getTime() ? next : cur,
    );
  }, []);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${auctionId}/live`, { cache: 'no-store' });
      const parsed = liveAuctionStateDtoSchema.safeParse(await res.json());
      if (parsed.success) apply(parsed.data);
    } catch {
      // the stream will catch up
    }
  }, [auctionId, apply]);

  useEffect(() => {
    const es = new EventSource(`/api/auctions/${auctionId}/stream`);
    es.addEventListener('state', (e) => {
      const parsed = liveAuctionStateDtoSchema.safeParse(
        JSON.parse((e as MessageEvent<string>).data),
      );
      if (parsed.success) apply(parsed.data);
    });
    es.onopen = () => {
      setConnection('open');
    };
    es.onerror = () => {
      // EventSource reconnects by itself (retry: 3000).
      setConnection('lost');
    };
    return () => {
      es.close();
    };
  }, [auctionId, apply]);

  const target = countdownTarget(state);
  const remaining = target ? new Date(target.at).getTime() - now : null;

  // When a deadline passes, the worker pushes the change; fetch once more in case we missed it.
  const expiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!target || remaining === null || remaining > 0 || expiredFor.current === target.at) return;
    expiredFor.current = target.at;
    const t = setTimeout(() => void refetch(), 1500);
    return () => {
      clearTimeout(t);
    };
  }, [target, remaining, refetch]);

  // --- actions -------------------------------------------------------------------------------
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Confirmation of the viewer's own bid; hidden as soon as a newer bid exists.
  const [flash, setFlash] = useState<{ text: string; seq: number } | null>(null);

  const open = (kind: Action['kind'], amountCents: string) => {
    setActionError(null);
    setFlash(null);
    // One key per confirmed intent: a retry after a network error cannot bid twice.
    setAction({ kind, amountCents, key: crypto.randomUUID() });
  };

  async function submit() {
    if (!action) return;
    setPending(true);
    setActionError(null);
    const body =
      action.kind === 'bid'
        ? { amountCents: action.amountCents, idempotencyKey: action.key }
        : { expectedPriceCents: action.amountCents, idempotencyKey: action.key };
    const result = await apiJson<BidResultDto>(
      'POST',
      `/api/auctions/${auctionId}/${ACTION_URL[action.kind]}`,
      body,
    );
    setPending(false);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setAction(null);
    const { bid, auction } = result.data;
    setFlash({
      text:
        `Zabeleženo: ${BID_KIND_LABEL[bid.kind].toLowerCase()} ${formatCents(bid.amountCents)} (zap. št. ${String(bid.seq)}).` +
        (auction.extended ? ' Dražba je podaljšana.' : ''),
      seq: bid.seq,
    });
    void refetch();
  }

  // Price the open dialog was confirmed against no longer applies.
  const stale =
    action !== null &&
    action.kind !== 'bid' &&
    (state.currentPriceCents !== action.amountCents ||
      (action.kind === 'accept' && state.status !== 'LIVE') ||
      (action.kind === 'match' && state.status !== 'PREEMPTION'));

  const viewer = state.viewer;
  const isLive = state.status === 'LIVE';
  const ended = ['ENDED', 'UNSUCCESSFUL', 'CANCELLED'].includes(state.status);
  const lastBid = state.bids[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <section className="grid content-start gap-4">
        {/* Price and countdown */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusLine state={state} />
            <ConnectionBadge connection={connection} />
          </div>

          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">
                {state.mode === 'DESCENDING' ? 'Trenutna cena' : 'Najvišja ponudba'}
              </p>
              <p className="text-4xl font-semibold tracking-tight tabular-nums" aria-live="polite">
                {state.currentPriceCents ? formatCents(state.currentPriceCents) : '—'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.currentPriceCents === null
                  ? `Izklicna cena ${formatCents(state.startingPriceCents)}`
                  : state.leaderPseudonym
                    ? `Vodi: ${state.leaderPseudonym}`
                    : state.floorPriceCents
                      ? `Najnižja cena ${formatCents(state.floorPriceCents)}`
                      : null}
              </p>
            </div>
            {target && remaining !== null && (
              <div>
                <p className="text-sm text-muted-foreground">{target.label}</p>
                <p
                  role="timer"
                  className={cn(
                    'text-4xl font-semibold tracking-tight tabular-nums',
                    isLive && remaining < 60_000 && 'text-destructive',
                  )}
                >
                  {formatRemaining(remaining)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {timeFmt.format(new Date(target.at))} (strežniški čas)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Personal status */}
        {viewer?.approved && viewer.isLeading && !ended && (
          <Alert variant="success" className="flex items-center gap-2 text-base">
            <CircleCheck className="size-5 shrink-0" aria-hidden />
            <span>
              <strong>Vodite.</strong> Vaša ponudba ({viewer.pseudonym}) je trenutno najvišja.
            </span>
          </Alert>
        )}
        {viewer?.approved &&
          !viewer.isLeading &&
          !ended &&
          lastBid &&
          state.mode === 'ASCENDING' &&
          state.bids.some((b) => b.pseudonym === viewer.pseudonym) && (
            <Alert variant="warning" className="flex items-center gap-2">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              Vašo ponudbo je presegel drug dražitelj.
            </Alert>
          )}
        {ended && <Outcome state={state} />}
        {flash && state.bidCount <= flash.seq && <Alert variant="success">{flash.text}</Alert>}

        {/* Actions */}
        <div className="rounded-xl border bg-card p-5">
          <ActionPanel
            state={state}
            signedIn={signedIn}
            signedInAs={signedInAs}
            loginHref={loginHref}
            onBid={(cents) => {
              open('bid', cents);
            }}
            onAccept={() => {
              if (state.currentPriceCents) open('accept', state.currentPriceCents);
            }}
            onMatch={() => {
              if (state.currentPriceCents) open('match', state.currentPriceCents);
            }}
          />
        </div>
      </section>

      <BidLog state={state} />

      <ConfirmDialog
        open={action !== null}
        title={
          action?.kind === 'accept'
            ? 'Sprejem cene'
            : action?.kind === 'match'
              ? 'Uveljavitev predkupne pravice'
              : 'Oddaja ponudbe'
        }
        confirmLabel={
          action?.kind === 'accept'
            ? 'Sprejmem ceno'
            : action?.kind === 'match'
              ? 'Izenačim ponudbo'
              : 'Oddam ponudbo'
        }
        pending={pending}
        confirmDisabled={stale}
        onCancel={() => {
          setAction(null);
          setActionError(null);
        }}
        onConfirm={() => void submit()}
      >
        {action && (
          <>
            <p className="text-3xl font-semibold tabular-nums">{formatCents(action.amountCents)}</p>
            <p>
              {action.kind === 'bid' &&
                'Ponudba je zavezujoča in nepreklicna. Če bo na koncu najvišja, ste dolžni skleniti pogodbo in plačati kupnino.'}
              {action.kind === 'accept' &&
                'S sprejemom cene oddate zavezujočo in nepreklicno ponudbo v tem znesku.'}
              {action.kind === 'match' &&
                'Z uveljavitvijo predkupne pravice zavezujoče izenačite najvišjo ponudbo.'}
            </p>
            {stale && (
              <Alert variant="warning">
                Cena ali stanje dražbe se je medtem spremenilo. Zaprite okno in poskusite znova.
              </Alert>
            )}
            {actionError && <Alert variant="destructive">{actionError}</Alert>}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function StatusLine({ state }: { state: LiveAuctionStateDto }) {
  const label: Record<LiveAuctionStateDto['status'], string> = {
    DRAFT: 'Osnutek',
    PUBLISHED: 'Dražba se še ni začela',
    REGISTRATION_CLOSED: 'Dražba se še ni začela',
    LIVE:
      state.mode === 'ASCENDING'
        ? state.type === 'DESCENDING'
          ? 'V teku – nadaljevanje z zviševanjem cene'
          : 'V teku – zviševanje cene'
        : 'V teku – zniževanje cene',
    PREEMPTION: 'Uveljavljanje predkupne pravice',
    ENDED: 'Zaključena',
    UNSUCCESSFUL: 'Neuspešna',
    CANCELLED: 'Ustavljena / preklicana',
  };
  const live = state.status === 'LIVE' || state.status === 'PREEMPTION';
  return (
    <p className="flex items-center gap-2 font-medium">
      {live && <span className="size-2.5 animate-pulse rounded-full bg-red-600" aria-hidden />}
      {label[state.status]}
    </p>
  );
}

function ConnectionBadge({ connection }: { connection: 'connecting' | 'open' | 'lost' }) {
  const text = {
    connecting: 'Povezovanje …',
    open: 'Povezano v živo',
    lost: 'Povezava prekinjena – ponovno povezovanje …',
  }[connection];
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-xs',
        connection === 'lost' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <Radio className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}

function Outcome({ state }: { state: LiveAuctionStateDto }) {
  if (state.status === 'ENDED') {
    const mine = state.viewer?.isLeading;
    return (
      <Alert variant={mine ? 'success' : 'default'}>
        <strong>Dražba je zaključena.</strong>{' '}
        {state.currentPriceCents &&
          `Najvišja ponudba: ${formatCents(state.currentPriceCents)} (${state.leaderPseudonym ?? '—'}).`}{' '}
        {mine &&
          'Vaša ponudba je uspela. Upravitelj vas bo obvestil o nadaljnjih korakih (pogodba, plačilo kupnine).'}
      </Alert>
    );
  }
  if (state.status === 'UNSUCCESSFUL') {
    return (
      <Alert>
        <strong>Dražba je bila neuspešna.</strong> {state.closedReason}
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <strong>Dražbo je ustavil upravitelj.</strong>{' '}
      {state.closedReason && `Razlog: ${state.closedReason}`}
    </Alert>
  );
}

function ActionPanel({
  state,
  signedIn,
  signedInAs,
  loginHref,
  onBid,
  onAccept,
  onMatch,
}: {
  state: LiveAuctionStateDto;
  signedIn: boolean;
  signedInAs: string | null;
  loginHref: string;
  onBid: (amountCents: string) => void;
  onAccept: () => void;
  onMatch: () => void;
}) {
  const viewer = state.viewer;
  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        Dražbo lahko spremljate. Za oddajo ponudb se{' '}
        <Link href={loginHref} className="font-medium text-foreground underline underline-offset-2">
          prijavite
        </Link>{' '}
        kot potrjen dražitelj te dražbe.
      </p>
    );
  }
  if (!viewer) {
    return (
      <p className="text-sm text-muted-foreground">
        Prijavljeni ste kot <strong className="text-foreground">{signedInAs}</strong>. Ta račun ni
        prijavljen na to dražbo, zato jo lahko le spremljate. Za draženje se odjavite in prijavite z
        računom dražitelja, ki je prijavljen na dražbo.
      </p>
    );
  }
  if (!viewer.approved) {
    return (
      <p className="text-sm text-muted-foreground">
        Vaša prijava ({viewer.pseudonym}) še ni potrjena, zato ne morete oddajati ponudb.
      </p>
    );
  }

  const header = (
    <p className="mb-3 text-sm text-muted-foreground">
      Sodelujete kot <strong className="text-foreground">{viewer.pseudonym}</strong>
      {viewer.isPreemptionHolder && ' (predkupni upravičenec)'}.
    </p>
  );

  if (state.status === 'LIVE' && state.mode === 'ASCENDING' && state.minimumBidCents) {
    return (
      <>
        {header}
        <BidForm
          minimumCents={state.minimumBidCents}
          incrementCents={state.bidIncrementCents}
          leading={viewer.isLeading}
          onBid={onBid}
        />
      </>
    );
  }
  if (state.status === 'LIVE' && state.mode === 'DESCENDING' && state.currentPriceCents) {
    return (
      <>
        {header}
        <Button size="lg" className="w-full sm:w-auto" onClick={onAccept}>
          Sprejmem ceno {formatCents(state.currentPriceCents)}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Zmaga prvi dražitelj, ki sprejme trenutno ceno.
        </p>
      </>
    );
  }
  if (state.status === 'PREEMPTION') {
    if (viewer.canMatch && state.currentPriceCents) {
      return (
        <>
          {header}
          <Button size="lg" className="w-full sm:w-auto" onClick={onMatch}>
            Uveljavim predkupno pravico ({formatCents(state.currentPriceCents)})
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Najvišjo ponudbo lahko le izenačite, ne presežete.
          </p>
        </>
      );
    }
    return (
      <>
        {header}
        <p className="text-sm text-muted-foreground">
          Glavni del dražbe je končan. Predkupni upravičenci lahko izenačijo najvišjo ponudbo.
        </p>
      </>
    );
  }
  if (state.status === 'PUBLISHED' || state.status === 'REGISTRATION_CLOSED') {
    return (
      <>
        {header}
        <p className="text-sm text-muted-foreground">
          Oddajanje ponudb bo mogoče ob začetku dražbe. Stran se osveži sama.
        </p>
      </>
    );
  }
  return header;
}

function BidForm({
  minimumCents,
  incrementCents,
  leading,
  onBid,
}: {
  minimumCents: string;
  incrementCents: string | null;
  leading: boolean;
  onBid: (amountCents: string) => void;
}) {
  // null = follow the current minimum; a string = what the bidder typed or picked.
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = typed ?? centsToInput(minimumCents);

  const set = (cents: bigint) => {
    setTyped(centsToInput(cents));
    setError(null);
  };

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseEuroInput(value);
    if (cents === null) {
      setError('Vnesite znesek v evrih, npr. 125.000,00.');
      return;
    }
    if (cents < BigInt(minimumCents)) {
      setError(`Najnižja dovoljena ponudba je ${formatCents(minimumCents)}.`);
      return;
    }
    setError(null);
    setTyped(null);
    onBid(cents.toString());
  }

  if (leading) {
    return (
      <p className="text-sm text-muted-foreground">
        Vaša ponudba je najvišja. Novo ponudbo lahko oddate, ko vas kdo preseže.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="bid-amount">Vaša ponudba (EUR)</Label>
        <Input
          id="bid-amount"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error !== null}
          aria-describedby="bid-hint"
          onChange={(e) => {
            setTyped(e.target.value);
            setError(null);
          }}
          className="h-11 text-lg tabular-nums"
        />
        <p id="bid-hint" className="text-xs text-muted-foreground">
          Najnižja ponudba: {formatCents(minimumCents)}
          {incrementCents && ` · korak draženja ${formatCents(incrementCents)}`}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {incrementCents &&
          [1n, 2n, 5n].map((k) => (
            <Button
              key={k.toString()}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                set(BigInt(minimumCents) + (k - 1n) * BigInt(incrementCents));
              }}
            >
              {k === 1n ? 'Najnižja' : `+${String(k)} koraki`}
            </Button>
          ))}
      </div>
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Oddaj ponudbo
      </Button>
    </form>
  );
}

function BidLog({ state }: { state: LiveAuctionStateDto }) {
  const me = state.viewer?.pseudonym;
  return (
    <section className="rounded-xl border bg-card lg:max-h-[36rem] lg:overflow-auto">
      <h2 className="border-b bg-card px-4 py-3 font-semibold lg:sticky lg:top-0">
        Potek dražbe <span className="font-normal text-muted-foreground">({state.bidCount})</span>
      </h2>
      {state.bids.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Ponudb še ni.</p>
      ) : (
        <ol className="divide-y">
          {state.bids.map((b, i) => (
            <li
              key={b.seq}
              className={cn(
                'grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 px-4 py-2.5 text-sm',
                i === 0 && 'bg-accent/50',
              )}
            >
              <span className="text-xs text-muted-foreground tabular-nums">#{b.seq}</span>
              <span className="min-w-0">
                <span className="font-medium">
                  {b.pseudonym}
                  {b.pseudonym === me && <span className="text-muted-foreground"> (vi)</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {BID_KIND_LABEL[b.kind]} · {timeFmt.format(new Date(b.serverTime))}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatCents(b.amountCents)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
