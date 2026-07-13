// Edge-runtime stub — Node.js built-ins not available in edge.
// Real implementation: onboarding-service.ts (Node.js only, aliased via next.config.mjs)

export async function startHotboxOnboarding(_org: string): Promise<void> {}
export function stopHotboxOnboarding(): void {}
export { presenceMap } from './presence';
export type { PresenceStatus } from './presence';
