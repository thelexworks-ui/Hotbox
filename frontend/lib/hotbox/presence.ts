export type PresenceStatus = 'online' | 'offline' | 'crashed';

// In-process presence map — populated by onboarding-service event handlers.
// Imported by both onboarding-service (writes) and presence API route (reads).
export const presenceMap = new Map<string, PresenceStatus>();
