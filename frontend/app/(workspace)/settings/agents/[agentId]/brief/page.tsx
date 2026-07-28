'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SettingsBanner } from '@/components/settings/shared';

// ── Default template ──────────────────────────────────────────────────────────

function buildDefaultBrief(agentName: string, role: string): string {
  return `---
role: ${agentName}
version: 1
---

## Role & Purpose

You are the **${agentName}** agent. ${role.charAt(0).toUpperCase() + role.slice(1)} role.

[One sentence: what problem you solve or function you perform for this org.]

---

## Responsibilities

- [PRIMARY RESPONSIBILITY]
- [SECONDARY RESPONSIBILITY]
- [TERTIARY RESPONSIBILITY]

When in doubt about scope: *Does this move the org forward in my domain?* If yes, act. If no, route it to the right agent or headmaster.

---

## Communication Style

- **Tone:** Direct, warm, professional. Match the register of who you are addressing.
- **Length:** Default to brief. One well-placed sentence beats a paragraph.
- **Ambiguity:** State what you know, name what you do not, propose a next step.

---

## Tools & Capabilities

| Tool / Skill | What you use it for |
|---|---|
| [TOOL NAME] | [BRIEF PURPOSE] |

---

## Etiquette

**Channel vs DM:**
- Post deliverables and status updates to the appropriate channel.
- Use DMs for direct coordination with a specific person or agent.
- #general is for org-wide announcements only.

**Working with humans:**
- Acknowledge before you act.
- Never assume silence is approval.

**Escalation:**
- Page the headmaster when blocked for more than 2 hours or when a decision is outside your authority.
- Escalation path: \`cortextos bus send-message boss urgent '[summary]'\`

---

## Hotbox 101

Hotbox is the real-time messaging and coordination layer for your org.

| Concept | What it means |
|---|---|
| Channel | A named multi-member room with persistent history |
| DM | Direct message between two members — private |
| #general | Every org member is in it — org-wide announcements only |

**Bus vs Hotbox:**
- Use **bus** for agent-to-agent work and event logging
- Use **Hotbox channel** for deliverables a human should see
- Use **Hotbox DM** for direct coordination with a specific human

**Escalation:**
1. Bus-first: \`cortextos bus send-message boss urgent '<summary>'\`
2. Hotbox DM to headmaster if bus is unresponsive
3. \`/settings/report\` for platform-level issues
`;
}

// ── Minimal markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^---\s*$/gm, '<hr style="border:none;border-top:1px solid var(--hotbox-border);margin:16px 0">')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:15px;font-weight:600;color:var(--hotbox-text);margin:20px 0 8px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:600;color:var(--hotbox-text);margin:16px 0 6px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="font-family:monospace;font-size:11px;background:var(--hotbox-surface-2);padding:1px 4px;border-radius:3px">$1</code>')
    .replace(/^\| (.+)$/gm, (line) => {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      const isHeader = false;
      return `<div style="display:flex;border-bottom:1px solid var(--hotbox-border)">${cells.map(c =>
        `<div style="flex:1;padding:4px 8px;font-size:12px;color:var(--hotbox-text)">${c}</div>`
      ).join('')}</div>`;
    })
    .replace(/^- (.+)$/gm, '<li style="font-size:13px;color:var(--hotbox-text-muted);margin:3px 0;margin-left:16px;list-style:disc">$1</li>')
    .replace(/\n\n/g, '<br/>')
    .replace(/^[^<\n].+$/gm, (line) => `<p style="font-size:13px;color:var(--hotbox-text-muted);margin:4px 0">${line}</p>`);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentBriefPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/org/agents/${agentId}/brief`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { router.push('/settings/agents'); return; }
        setAgentName(d.agentName ?? '');
        setAgentRole(d.role ?? '');
        setBrief(d.brief ?? buildDefaultBrief(d.agentName ?? 'Agent', d.role ?? 'agent'));
      })
      .catch(() => router.push('/settings/agents'))
      .finally(() => setLoading(false));
  }, [agentId, router]);

  const save = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/org/agents/${agentId}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief }),
      });
      if (!res.ok) {
        const d = await res.json();
        setBanner({ type: 'error', message: d.error ?? 'Failed to save' });
      } else {
        setDirty(false);
        setBanner({ type: 'success', message: 'Brief saved' });
        setTimeout(() => setBanner(null), 2500);
      }
    } catch {
      setBanner({ type: 'error', message: 'Network error — please try again' });
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (dirty) save();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = brief.slice(0, start) + '  ' + brief.slice(end);
      setBrief(next);
      setDirty(true);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  if (loading) {
    return (
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Role Brief</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-4">Loading…</p>
      </div>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '8px 8px 0 0',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--hotbox-text)' : 'var(--hotbox-text-muted)',
    background: active ? 'var(--hotbox-surface-2)' : 'transparent',
    border: active ? '1px solid var(--hotbox-border)' : '1px solid transparent',
    borderBottom: active ? '1px solid var(--hotbox-surface-2)' : '1px solid var(--hotbox-border)',
    cursor: 'pointer',
    transition: 'all 0.1s',
    marginBottom: '-1px',
  });

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.push('/settings/agents')}
          className="text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)] transition-colors mb-3 flex items-center gap-1"
        >
          ← Agents
        </button>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">
              {agentName}
            </h1>
            <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-0.5">
              Role brief · {agentRole}
            </p>
          </div>
        </div>
      </div>

      <p className="text-[12px] text-[var(--hotbox-text-dim)] mb-5">
        This brief is injected into the agent's context at boot. Write it in Markdown. Ctrl+S to save.
      </p>

      {banner && (
        <div className="mb-4">
          <SettingsBanner type={banner.type} message={banner.message} />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-end mb-0" style={{ borderBottom: '1px solid var(--hotbox-border)' }}>
        <button style={tabStyle(tab === 'edit')} onClick={() => setTab('edit')}>Edit</button>
        <button style={tabStyle(tab === 'preview')} onClick={() => setTab('preview')}>Preview</button>
        <div className="flex-1" />
        {dirty && (
          <span className="text-[11px] text-[var(--hotbox-amber,#f59e0b)] mb-1.5 mr-2">Unsaved changes</span>
        )}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="mb-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--hotbox-accent)', color: 'var(--hotbox-accent-fg, #000)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Editor / Preview */}
      <div
        className="rounded-b-[12px] overflow-hidden"
        style={{ border: '1px solid var(--hotbox-border)', borderTop: 'none', minHeight: '520px' }}
      >
        {tab === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={brief}
            onChange={e => { setBrief(e.target.value); setDirty(true); }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="w-full h-full font-mono text-[12px] p-5 resize-none focus:outline-none"
            style={{
              background: 'var(--hotbox-bg)',
              color: 'var(--hotbox-text)',
              minHeight: '520px',
              lineHeight: '1.7',
            }}
          />
        ) : (
          <div
            className="p-6"
            style={{ background: 'var(--hotbox-bg)', minHeight: '520px' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(brief) }}
          />
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <span className="text-[11px] text-[var(--hotbox-text-dim)]">
          {brief.length} chars · Markdown supported
        </span>
        <button
          onClick={() => {
            if (window.confirm('Reset to default template? Current content will be lost.')) {
              setBrief(buildDefaultBrief(agentName, agentRole));
              setDirty(true);
            }
          }}
          className="text-[11px] text-[var(--hotbox-text-dim)] hover:text-[var(--hotbox-text-muted)] transition-colors"
        >
          Reset to template
        </button>
      </div>
    </div>
  );
}
