import { PUBLIC_PHASE_LABEL, type PublicPhase } from '@domik/shared';
import { Badge } from '@/components/ui/badge';

const VARIANT: Record<PublicPhase, 'success' | 'warning' | 'default' | 'outline' | 'destructive'> =
  {
    REGISTRATION_OPEN: 'success',
    REGISTRATION_CLOSED: 'warning',
    LIVE: 'default',
    ENDED: 'outline',
    UNSUCCESSFUL: 'outline',
    CANCELLED: 'destructive',
  };

export function PhaseBadge({ phase }: { phase: PublicPhase }) {
  return <Badge variant={VARIANT[phase]}>{PUBLIC_PHASE_LABEL[phase]}</Badge>;
}
