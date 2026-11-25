import { AUCTION_DEFAULTS, type AuctionType } from '@domik/shared';
import { subtractWorkingDays } from '../calendar/working-days';
import { type FieldErrors } from '../errors';

/** Auction parameters set by the trustee (see CLAUDE.md "Auction rules"). */
export interface AuctionConfig {
  type: AuctionType;
  startingPriceCents: bigint;
  /** ASCENDING, or DESCENDING with switchToAscendingOnAccept. */
  bidIncrementCents: bigint | null;
  /** DESCENDING only. */
  priceDecrementCents: bigint | null;
  floorPriceCents: bigint | null;
  stepDurationSec: number | null;
  switchToAscendingOnAccept: boolean;
  startsAt: Date;
  /** ASCENDING only (a DESCENDING auction ends when the floor step expires). */
  endsAt: Date | null;
  extensionWindowSec: number;
  extensionSec: number;
  registrationDeadline: Date;
  depositCents: bigint;
  preemptionEnabled: boolean;
  preemptionWindowSec: number;
  courtApprovalRef: string | null;
}

export const MIN_ASCENDING_DURATION_SEC = 5 * 60;
export const MIN_STEP_DURATION_SEC = 10;
export const MIN_PREEMPTION_WINDOW_SEC = 60;
export const MAX_DESCENDING_STEPS = 10_000;

/** Default registration deadline: 2 working days before the start, same local time. */
export function defaultRegistrationDeadline(startsAt: Date): Date {
  return subtractWorkingDays(startsAt, AUCTION_DEFAULTS.registrationDeadlineWorkingDays);
}

// LEGAL-REVIEW: is a fixed deposit percentage mandatory? — see docs/legal-review.md
/** Default deposit: 10 % of the starting price (integer cents, rounded down). */
export function defaultDepositCents(startingPriceCents: bigint): bigint {
  return (startingPriceCents * BigInt(AUCTION_DEFAULTS.depositPercent)) / 100n;
}

/** Clears parameters that do not apply to the chosen auction type. */
export function normalizeAuctionConfig(c: AuctionConfig): AuctionConfig {
  if (c.type === 'ASCENDING') {
    return {
      ...c,
      priceDecrementCents: null,
      floorPriceCents: null,
      stepDurationSec: null,
      switchToAscendingOnAccept: false,
    };
  }
  return {
    ...c,
    endsAt: null,
    bidIncrementCents: c.switchToAscendingOnAccept ? c.bidIncrementCents : null,
  };
}

export interface DescendingSchedule {
  /** Number of price levels, including the starting price and the floor. */
  steps: number;
  /** When the last (floor) step expires if nobody accepts. */
  endsAt: Date;
}

/** Price-drop schedule of a valid DESCENDING config. Null if the config is incomplete. */
export function descendingSchedule(c: AuctionConfig): DescendingSchedule | null {
  const { priceDecrementCents: dec, floorPriceCents: floor, stepDurationSec: step } = c;
  if (c.type !== 'DESCENDING' || dec == null || floor == null || step == null) return null;
  if (dec <= 0n || floor > c.startingPriceCents || step <= 0) return null;
  const range = c.startingPriceCents - floor;
  // ceil(range / dec) drops (the last one may be shorter), plus the starting level.
  const steps = Number((range + dec - 1n) / dec) + 1;
  return { steps, endsAt: new Date(c.startsAt.getTime() + steps * step * 1000) };
}

/**
 * Cross-field business validation of an auction config.
 * Returns field -> Slovenian message; an empty object means the config is valid.
 */
export function validateAuctionConfig(c: AuctionConfig, now: Date): FieldErrors {
  const errors: FieldErrors = {};
  const usesAscendingPhase = c.type === 'ASCENDING' || c.switchToAscendingOnAccept;

  // --- prices -------------------------------------------------------------
  if (c.startingPriceCents <= 0n) {
    errors.startingPriceCents = 'Izklicna cena mora biti večja od 0.';
  }
  if (c.depositCents <= 0n) {
    errors.depositCents = 'Varščina mora biti večja od 0.';
  } else if (c.depositCents > c.startingPriceCents) {
    errors.depositCents = 'Varščina ne sme presegati izklicne cene.';
  }

  if (usesAscendingPhase) {
    if (c.bidIncrementCents == null || c.bidIncrementCents <= 0n) {
      errors.bidIncrementCents =
        c.type === 'ASCENDING'
          ? 'Korak draženja mora biti večji od 0.'
          : 'Za nadaljevanje z zviševanjem določite korak draženja, večji od 0.';
    } else if (c.bidIncrementCents > c.startingPriceCents) {
      errors.bidIncrementCents = 'Korak draženja ne sme presegati izklicne cene.';
    }
  }

  if (c.type === 'DESCENDING') {
    if (c.priceDecrementCents == null || c.priceDecrementCents <= 0n) {
      errors.priceDecrementCents = 'Korak zniževanja mora biti večji od 0.';
    }
    if (c.floorPriceCents == null || c.floorPriceCents <= 0n) {
      errors.floorPriceCents = 'Najnižja cena mora biti večja od 0.';
    } else if (c.floorPriceCents > c.startingPriceCents) {
      errors.floorPriceCents = 'Najnižja cena ne sme presegati izklicne cene.';
    } else if (
      c.priceDecrementCents != null &&
      c.priceDecrementCents > 0n &&
      c.floorPriceCents < c.startingPriceCents &&
      c.priceDecrementCents > c.startingPriceCents - c.floorPriceCents
    ) {
      errors.priceDecrementCents =
        'Korak zniževanja ne sme biti večji od razlike med izklicno in najnižjo ceno.';
    }
    if (c.stepDurationSec == null || c.stepDurationSec < MIN_STEP_DURATION_SEC) {
      errors.stepDurationSec = `Trajanje koraka mora biti vsaj ${MIN_STEP_DURATION_SEC} sekund.`;
    }
    const schedule = descendingSchedule(c);
    if (schedule && schedule.steps > MAX_DESCENDING_STEPS && !errors.priceDecrementCents) {
      errors.priceDecrementCents = `Preveč korakov zniževanja (${schedule.steps}). Povečajte korak zniževanja.`;
    }
  }

  // --- timing: now < registrationDeadline < startsAt < endsAt -------------------
  // LEGAL-REVIEW: no minimum publication lead time is enforced — see docs/legal-review.md
  if (c.startsAt.getTime() <= now.getTime()) {
    errors.startsAt = 'Začetek dražbe mora biti v prihodnosti.';
  }
  if (c.registrationDeadline.getTime() >= c.startsAt.getTime()) {
    errors.registrationDeadline = 'Rok za prijavo mora biti pred začetkom dražbe.';
  } else if (c.registrationDeadline.getTime() <= now.getTime()) {
    errors.registrationDeadline = 'Rok za prijavo mora biti v prihodnosti.';
  }

  if (c.type === 'ASCENDING') {
    if (c.endsAt == null) {
      errors.endsAt = 'Določite konec dražbe.';
    } else if (c.endsAt.getTime() <= c.startsAt.getTime()) {
      errors.endsAt = 'Konec dražbe mora biti po začetku dražbe.';
    } else if (c.endsAt.getTime() - c.startsAt.getTime() < MIN_ASCENDING_DURATION_SEC * 1000) {
      errors.endsAt = `Dražba mora trajati vsaj ${MIN_ASCENDING_DURATION_SEC / 60} minut.`;
    }
  }

  // --- anti-sniping ----------------------------------------------------------
  if (usesAscendingPhase) {
    if (c.extensionWindowSec < 0) {
      errors.extensionWindowSec = 'Okno podaljšanja ne sme biti negativno.';
    }
    if (c.extensionWindowSec > 0 && c.extensionSec <= 0) {
      errors.extensionSec = 'Podaljšanje mora biti daljše od 0 sekund.';
    }
  }

  // --- pre-emption --------------------------------------------------------------
  if (c.preemptionEnabled && c.preemptionWindowSec < MIN_PREEMPTION_WINDOW_SEC) {
    errors.preemptionWindowSec = `Rok za uveljavitev predkupne pravice mora biti vsaj ${MIN_PREEMPTION_WINDOW_SEC} sekund.`;
  }

  return errors;
}
