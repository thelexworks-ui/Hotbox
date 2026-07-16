import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const LLM_KEY_SECRET = Buffer.from(process.env.LLM_KEY_SECRET!, 'base64url');

export function encryptLlmKey(plainKey: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, LLM_KEY_SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store ciphertext + tag concatenated (last 16 bytes = tag)
  const combined = Buffer.concat([encrypted, tag]);
  return {
    ciphertext: combined.toString('base64url'),
    iv: iv.toString('base64url'),
  };
}

export function decryptLlmKey(ciphertext: string, iv: string): string {
  const combined = Buffer.from(ciphertext, 'base64url');
  const ivBuf = Buffer.from(iv, 'base64url');
  const tag = combined.subarray(combined.length - 16);
  const encData = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv(ALG, LLM_KEY_SECRET, ivBuf);
  decipher.setAuthTag(tag);
  return decipher.update(encData) + decipher.final('utf8');
}

export type LlmProvider = 'anthropic' | 'openai' | 'xai' | 'google';

interface ValidationResult {
  valid: boolean;
  models_available: string[];
  error?: string;
}

export async function validateLlmKey(provider: LlmProvider, apiKey: string): Promise<ValidationResult> {
  try {
    switch (provider) {
      case 'anthropic': {
        const r = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        });
        if (!r.ok) return { valid: false, models_available: [], error: `HTTP ${r.status}` };
        const d = await r.json() as { data: { id: string }[] };
        return { valid: true, models_available: d.data?.map((m) => m.id) ?? [] };
      }
      case 'openai': {
        const r = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!r.ok) return { valid: false, models_available: [], error: `HTTP ${r.status}` };
        const d = await r.json() as { data: { id: string }[] };
        return { valid: true, models_available: d.data?.map((m) => m.id) ?? [] };
      }
      case 'xai': {
        const r = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!r.ok) return { valid: false, models_available: [], error: `HTTP ${r.status}` };
        const d = await r.json() as { data: { id: string }[] };
        return { valid: true, models_available: d.data?.map((m) => m.id) ?? [] };
      }
      case 'google': {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!r.ok) return { valid: false, models_available: [], error: `HTTP ${r.status}` };
        const d = await r.json() as { models: { name: string }[] };
        return { valid: true, models_available: d.models?.map((m) => m.name) ?? [] };
      }
      default:
        return { valid: false, models_available: [], error: 'Unknown provider' };
    }
  } catch (err) {
    return { valid: false, models_available: [], error: String(err) };
  }
}
