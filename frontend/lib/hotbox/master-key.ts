export type MasterKeyRole = 'orchestrator' | 'headmaster';

export function validateMasterKey(headerValue: string | null | undefined): MasterKeyRole | null {
  if (!headerValue) return null;
  const orch = process.env.ORCHESTRATOR_MASTER_KEY;
  const head = process.env.HEADMASTER_MASTER_KEY;
  if (orch && headerValue === orch) return 'orchestrator';
  if (head && headerValue === head) return 'headmaster';
  return null;
}
