export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const org = process.env.HOTBOX_ORG ?? 'toadsage';

  // Resolved by webpack to the real onboarding-service for node target,
  // and to the stub for edge target (via alias in next.config.mjs).
  const { startHotboxOnboarding } = await import('./lib/hotbox/onboarding-service');

  startHotboxOnboarding(org).catch((err: unknown) => {
    console.error('[hotbox-onboarding] boot error:', err);
  });
}
