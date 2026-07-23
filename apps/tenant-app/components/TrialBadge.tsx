import { getTrialDaysLeft, getTrialState } from '@/lib/trial';
import type { Tenant } from '@/lib/types';
import { Badge } from './ui/badge';

export function TrialBadge({ tenant }: { tenant: Pick<Tenant, 'status' | 'trial_ends_at'> }) {
  const state = getTrialState(tenant);
  if (state === 'PRODUCTION') return null;

  const daysLeft = getTrialDaysLeft(tenant);
  const label = state === 'TRIAL_EXPIRED' ? 'Masa coba berakhir' : `Trial ${daysLeft} hari tersisa`;

  return <Badge variant={state === 'TRIAL_EXPIRING' || state === 'TRIAL_EXPIRED' ? 'warning' : 'accent'}>{label}</Badge>;
}
