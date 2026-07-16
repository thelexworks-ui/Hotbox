export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // F5: fail-loud at server startup if critical secrets are missing.
  // Catches misconfigured deployments before any request is served.
  if (!process.env.HOTBOX_JWT_SECRET) {
    throw new Error('[startup] HOTBOX_JWT_SECRET is not set — server will not start. Set this env var and redeploy.');
  }

  const org = process.env.HOTBOX_ORG ?? 'toadsage';

  // Resolved by webpack to the real onboarding-service for node target,
  // and to the stub for edge target (via alias in next.config.mjs).
  const { startHotboxOnboarding } = await import('./lib/hotbox/onboarding-service');

  startHotboxOnboarding(org).catch((err: unknown) => {
    console.error('[hotbox-onboarding] boot error:', err);
  });
}
