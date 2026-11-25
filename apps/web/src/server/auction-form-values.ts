import 'server-only';
import { defaultDepositCents, defaultRegistrationDeadline } from '@domik/core';
import type { AuctionRow, LotRow } from '@domik/db';
import {
  AUCTION_DEFAULTS,
  centsToInput,
  fromWallTime,
  toDateTimeLocal,
  toWallTime,
} from '@domik/shared';
import { type AuctionFormValues } from '@/components/trustee/auction-form';

const money = (cents: bigint | null): string => (cents === null ? '' : centsToInput(cents));

/** Suggested values for a new auction on `lot`. */
export function newAuctionFormValues(lot: LotRow, now: Date): AuctionFormValues {
  // Start 30 days from now at 10:00 Slovenian time, one hour long.
  const wall = toWallTime(new Date(now.getTime() + 30 * 24 * 3600 * 1000));
  const startsAt = fromWallTime({ ...wall, hour: 10, minute: 0 });
  const endsAt = new Date(startsAt.getTime() + 3600 * 1000);
  const starting = lot.appraisalValueCents;

  return {
    type: 'ASCENDING',
    startingPrice: money(starting),
    // 1 % of the starting price as a first suggestion.
    bidIncrement: starting === null ? '' : money(starting / 100n),
    priceDecrement: '',
    floorPrice: '',
    stepDurationSec: String(AUCTION_DEFAULTS.stepDurationSec),
    switchToAscendingOnAccept: false,
    startsAt: toDateTimeLocal(startsAt),
    endsAt: toDateTimeLocal(endsAt),
    extensionWindowSec: String(AUCTION_DEFAULTS.extensionWindowSec),
    extensionSec: String(AUCTION_DEFAULTS.extensionSec),
    registrationDeadline: toDateTimeLocal(defaultRegistrationDeadline(startsAt)),
    deposit: starting === null ? '' : money(defaultDepositCents(starting)),
    preemptionEnabled: false,
    preemptionWindowSec: String(AUCTION_DEFAULTS.preemptionWindowSec),
    courtApprovalRef: '',
  };
}

export function auctionFormValues(a: AuctionRow): AuctionFormValues {
  return {
    type: a.type,
    startingPrice: money(a.startingPriceCents),
    bidIncrement: money(a.bidIncrementCents),
    priceDecrement: money(a.priceDecrementCents),
    floorPrice: money(a.floorPriceCents),
    stepDurationSec: String(a.stepDurationSec ?? AUCTION_DEFAULTS.stepDurationSec),
    switchToAscendingOnAccept: a.switchToAscendingOnAccept,
    startsAt: toDateTimeLocal(a.startsAt),
    endsAt: a.endsAt ? toDateTimeLocal(a.endsAt) : '',
    extensionWindowSec: String(a.extensionWindowSec),
    extensionSec: String(a.extensionSec),
    registrationDeadline: toDateTimeLocal(a.registrationDeadline),
    deposit: money(a.depositCents),
    preemptionEnabled: a.preemptionEnabled,
    preemptionWindowSec: String(a.preemptionWindowSec),
    courtApprovalRef: a.courtApprovalRef ?? '',
  };
}
