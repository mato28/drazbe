import {
  AUCTION_TYPE_LABEL,
  AUCTION_TYPES,
  LISTED_PHASES,
  PROPERTY_KIND_LABEL,
  PROPERTY_KINDS,
  PUBLIC_PHASE_LABEL,
  type PublicAuctionQuery,
} from '@domik/shared';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

const euros = (cents: bigint | undefined): string =>
  cents === undefined ? '' : (cents / 100n).toString();

/** Plain GET form: works without JavaScript and every filter state is a shareable URL. */
export function AuctionFilters({
  query,
  municipalities,
}: {
  query: PublicAuctionQuery;
  municipalities: string[];
}) {
  // A town from a stale link stays selectable so the form reflects the URL.
  const towns =
    query.kraj && !municipalities.includes(query.kraj)
      ? [query.kraj, ...municipalities]
      : municipalities;

  return (
    <form
      action="/drazbe"
      method="get"
      aria-label="Filtri"
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="vrsta">Vrsta nepremičnine</Label>
        <NativeSelect id="vrsta" name="vrsta" defaultValue={query.vrsta ?? ''}>
          <option value="">Vse</option>
          {PROPERTY_KINDS.map((k) => (
            <option key={k} value={k}>
              {PROPERTY_KIND_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="kraj">Kraj</Label>
        <NativeSelect id="kraj" name="kraj" defaultValue={query.kraj ?? ''}>
          <option value="">Vsi</option>
          {towns.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="stanje">Stanje</Label>
        <NativeSelect id="stanje" name="stanje" defaultValue={query.stanje ?? ''}>
          <option value="">Vsa</option>
          {LISTED_PHASES.map((p) => (
            <option key={p} value={p}>
              {PUBLIC_PHASE_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nacin">Način dražbe</Label>
        <NativeSelect id="nacin" name="nacin" defaultValue={query.nacin ?? ''}>
          <option value="">Vsi</option>
          {AUCTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {AUCTION_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cenaOd">Cena od (EUR)</Label>
        <Input
          id="cenaOd"
          name="cenaOd"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={euros(query.cenaOd)}
          placeholder="0"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cenaDo">Cena do (EUR)</Label>
        <Input
          id="cenaDo"
          name="cenaDo"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={euros(query.cenaDo)}
          placeholder="brez omejitve"
        />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
        <Button type="submit">Prikaži dražbe</Button>
        <Button asChild variant="ghost">
          <Link href="/drazbe">Počisti filtre</Link>
        </Button>
      </div>
    </form>
  );
}
