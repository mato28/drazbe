import { AUCTION_STATUS_LABEL, type AuctionStatus } from '@domik/shared';
import { Badge } from '@/components/ui/badge';

const VARIANT: Record<
  AuctionStatus,
  'secondary' | 'success' | 'warning' | 'destructive' | 'default' | 'outline'
> = {
  DRAFT: 'secondary',
  PUBLISHED: 'success',
  REGISTRATION_CLOSED: 'warning',
  LIVE: 'default',
  PREEMPTION: 'warning',
  ENDED: 'outline',
  UNSUCCESSFUL: 'outline',
  CANCELLED: 'destructive',
};

export function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  return <Badge variant={VARIANT[status]}>{AUCTION_STATUS_LABEL[status]}</Badge>;
}
