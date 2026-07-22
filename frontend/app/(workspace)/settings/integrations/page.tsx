'use client';

export default function IntegrationsSettingsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Integrations</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Connect Hotbox with external tools and services</p>
      </div>
      <div
        className="flex flex-col items-center justify-center h-40 gap-2 rounded-[12px]"
        style={{ border: '1px dashed var(--hotbox-border)' }}
      >
        <span className="text-[13px] text-[var(--hotbox-text-dim)]">Coming in v2</span>
        <span className="text-[11px] text-[var(--hotbox-text-dim)] opacity-60">Zapier, Google Calendar, Linear</span>
      </div>
    </div>
  );
}
