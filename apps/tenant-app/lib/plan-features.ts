// Satu sumber kebenaran: packages/shared/src/plan-features.ts.
// Subpath ini sengaja tidak menarik pg/ioredis/aws-sdk, jadi aman di bundle browser.
export { PLAN_FEATURES, planHasFeature } from '@ipos-cloud/shared/plan-features';

// Nama lama yang dipakai PlanGate/Sidebar/menu/insight. Tanda tangannya identik dengan
// planHasFeature, jadi tidak ada call site yang perlu diubah.
export { planHasFeature as hasFeature } from '@ipos-cloud/shared/plan-features';
