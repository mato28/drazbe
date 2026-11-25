import { type VerificationStatus } from '@domik/shared';

/** What an identity provider is asked to verify. */
export interface IdentitySubject {
  profileId: string;
  type: 'PERSON' | 'COMPANY';
  fullName: string;
  taxId: string;
}

export interface IdentityVerification {
  status: VerificationStatus;
  /** Why the provider rejected the subject (REJECTED only). */
  reason?: string;
}

/**
 * How a bidder's identity gets verified. The rest of the system only looks at
 * `bidder_profiles.status`, so providers can be swapped without touching the flows.
 *
 * - `ManualIdentityProvider` (MVP): a trustee compares the uploaded ID document with the profile.
 * - later: SI-PASS / qualified-certificate login, which can answer VERIFIED immediately.
 */
export interface IdentityProvider {
  /** Stored in `bidder_profiles.identity_provider`. */
  readonly id: string;
  /**
   * `true` when a human has to decide (the review screen shows approve / reject);
   * `false` when the provider's own answer is final.
   */
  readonly requiresHumanReview: boolean;
  /** Called whenever a profile is created or resubmitted. */
  startVerification(subject: IdentitySubject): Promise<IdentityVerification>;
}

/** MVP provider: nothing is verified automatically; a trustee reviews the documents. */
export class ManualIdentityProvider implements IdentityProvider {
  readonly id = 'manual';
  readonly requiresHumanReview = true;

  startVerification(): Promise<IdentityVerification> {
    return Promise.resolve({ status: 'PENDING' });
  }
}
