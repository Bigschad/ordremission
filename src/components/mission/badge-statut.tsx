import type { MissionStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { statusLabel, statusVariant } from '@/lib/mission/status';

export function BadgeStatut({ statut }: { statut: MissionStatus }) {
  return <Badge variant={statusVariant(statut)}>{statusLabel(statut)}</Badge>;
}
