import type { Tenant } from './types';

export type TrialState = 'TRIAL_ACTIVE' | 'TRIAL_EXPIRING' | 'TRIAL_EXPIRED' | 'PRODUCTION';

export function getTrialDaysLeft(tenant: Pick<Tenant, 'trial_ends_at'>) {
  if (!tenant.trial_ends_at) return 0;
  const ms = new Date(tenant.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function getTrialState(tenant: Pick<Tenant, 'status' | 'trial_ends_at'>): TrialState {
  if (tenant.status !== 'trial') return 'PRODUCTION';
  const daysLeft = getTrialDaysLeft(tenant);
  if (daysLeft <= 0) return 'TRIAL_EXPIRED';
  if (daysLeft <= 3) return 'TRIAL_EXPIRING'; // PRD §3.5: hari ke-12..14 dari masa coba 14 hari
  return 'TRIAL_ACTIVE';
}
