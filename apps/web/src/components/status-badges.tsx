import {
  DEPOSIT_STATUS_LABEL,
  type DepositStatus,
  IDENTITY_STATUS_LABEL,
  REGISTRATION_STATUS_LABEL,
  type RegistrationStatus,
  type VerificationStatus,
} from '@domik/shared';
import { Badge } from '@/components/ui/badge';

const TONE = {
  PENDING: 'warning',
  VERIFIED: 'success',
  APPROVED: 'success',
  REJECTED: 'destructive',
} as const;

export function IdentityBadge({ status }: { status: VerificationStatus }) {
  return <Badge variant={TONE[status]}>{IDENTITY_STATUS_LABEL[status]}</Badge>;
}

export function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  return <Badge variant={TONE[status]}>{REGISTRATION_STATUS_LABEL[status]}</Badge>;
}

export function DepositBadge({ status }: { status: DepositStatus }) {
  const variant =
    status === 'PAID' || status === 'APPLIED' || status === 'REFUNDED'
      ? 'success'
      : status === 'PENDING' || status === 'REFUND_PENDING'
        ? 'warning'
        : status === 'FORFEITED'
          ? 'destructive'
          : 'outline';
  return <Badge variant={variant}>{DEPOSIT_STATUS_LABEL[status]}</Badge>;
}
