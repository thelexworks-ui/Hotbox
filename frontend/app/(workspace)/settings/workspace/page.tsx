'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  SettingsSection, SettingsRow, SettingsBanner, SettingsSkeleton,
  SettingsSaveBtn, SettingsInput,
} from '@/components/settings/shared';

interface WorkspaceInfo {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: string;
}

interface Member {
  id: string;
  name: string;
  role: string;
}

const AVATAR_COLORS = ['#5ADAEE', '#FFB830', '#4AE88A', '#8B5CF6', '#F97316', '#EC4899', '#3B82F6', '#FF4D4D'];

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return (
    name.split(/[\s_-]+/).map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') ||
    name.slice(0, 2).toUpperCase()
  );
}

function MemberRow({ member }: { member: Member }) {
  const color = avatarColor(member.id);
  const ini   = initials(member.name);
  const isAgent = member.role === 'agent';

  return (
    <div className="flex items-center gap-3 py-[11px] border-b border-[rgba(26,74,90,0.25)] last:border-0">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
        style={{ background: color, color: '#050C14' }}
      >
        {ini}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--hotbox-text)] truncate">{member.name}</div>
        <div className="text-[11px] text-[var(--hotbox-text-dim)]">{member.id}</div>
      </div>
      <span
        className="text-[10px] px-[7px] py-[2px] rounded-[5px] uppercase tracking-[0.06em] font-semibold flex-shrink-0"
        style={{
          background: isAgent ? 'rgba(90,218,238,0.10)' : 'rgba(74,232,138,0.10)',
          color: isAgent ? 'var(--hotbox-accent)' : 'var(--hotbox-online)',
          border: `1px solid ${isAgent ? 'rgba(90,218,238,0.20)' : 'rgba(74,232,138,0.20)'}`,
        }}
      >
        {isAgent ? 'agent' : 'member'}
      </span>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [inviteUrl, setInviteUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    fetch('/api/auth/invite', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setInviteUrl(d.inviteUrl);
        setExpiresAt(d.expiresAt);
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(5,12,20,0.80)' }}>
      <div
        className="w-full max-w-md rounded-[12px] p-6"
        style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border-strong)' }}
      >
        <h3 className="text-[15px] font-semibold text-[var(--hotbox-text)] mb-1">Invite to workspace</h3>
        <p className="text-[12px] text-[var(--hotbox-text-muted)] mb-5">Single-use link — expires in 72 hours</p>

        {loading && (
          <div className="h-10 rounded-[8px] animate-pulse" style={{ background: 'var(--hotbox-surface)' }} />
        )}
        {error && <div className="text-[12px] text-[var(--hotbox-crashed)] mb-4">{error}</div>}

        {inviteUrl && (
          <>
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] mb-2"
              style={{ background: 'var(--hotbox-bg)', border: '1px solid var(--hotbox-border)' }}
            >
              <span className="flex-1 text-[12px] text-[var(--hotbox-text-muted)] truncate font-mono">{inviteUrl}</span>
              <button
                onClick={copy}
                className="flex-shrink-0 px-3 py-1 rounded-[6px] text-[11px] font-semibold transition-colors"
                style={{
                  background: copied ? 'rgba(74,232,138,0.15)' : 'var(--hotbox-surface)',
                  color: copied ? 'var(--hotbox-online)' : 'var(--hotbox-text)',
                  border: '1px solid var(--hotbox-border)',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {expiryLabel && (
              <p className="text-[11px] text-[var(--hotbox-text-dim)] mb-4">Expires {expiryLabel}</p>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-[7px] text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers]     = useState<Member[]>([]);
  const [loading, setLoading]     = useState(true);
  const [banner, setBanner]       = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const [orgName, setOrgName] = useState('');
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/hotbox/workspace').then((r) => r.json()),
      fetch('/api/hotbox/members').then((r) => r.json()),
    ])
      .then(([ws, mem]) => {
        setWorkspace(ws);
        setOrgName(ws.orgName ?? '');
        setMembers(Array.isArray(mem) ? mem : []);
      })
      .catch(() => setBanner({ type: 'error', message: 'Failed to load workspace' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!workspace) return;
    setDirty(orgName !== workspace.orgName);
  }, [orgName, workspace]);

  const save = useCallback(async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/hotbox/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await res.json();
      if (!res.ok) { setBanner({ type: 'error', message: data.error ?? 'Save failed' }); return; }
      setWorkspace((w) => (w ? { ...w, orgName: data.orgName } : w));
      setDirty(false);
      setBanner({ type: 'success', message: 'Workspace name updated' });
      setTimeout(() => setBanner(null), 2500);
    } catch {
      setBanner({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  }, [orgName]);

  if (loading) return <SettingsSkeleton />;

  const isHeadmaster = workspace?.role === 'headmaster';

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-[var(--hotbox-text)]">Workspace</h1>
        <p className="text-[13px] text-[var(--hotbox-text-muted)] mt-1">Manage your organization, members, and invitations</p>
      </div>

      {banner && <SettingsBanner type={banner.type} message={banner.message} />}

      <SettingsSection title="Workspace">
        <SettingsRow
          label="Workspace name"
          description={isHeadmaster ? 'Visible to all members' : 'Contact your headmaster to change'}
        >
          {isHeadmaster ? (
            <SettingsInput value={orgName} onChange={setOrgName} placeholder="My Workspace" />
          ) : (
            <span className="text-[13px] text-[var(--hotbox-text)]">{workspace?.orgName}</span>
          )}
        </SettingsRow>

        <SettingsRow label="Workspace URL" description="Cannot be changed">
          <span
            className="text-[12px] px-3 py-1.5 rounded-[7px] font-mono text-[var(--hotbox-text-muted)]"
            style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border)' }}
          >
            {workspace?.orgSlug ?? '\u2014'}
          </span>
        </SettingsRow>

        <SettingsRow label="Plan">
          <span
            className="text-[10px] px-[7px] py-[3px] rounded-[5px] uppercase tracking-[0.06em] font-semibold"
            style={{
              background: 'rgba(90,218,238,0.10)',
              color: 'var(--hotbox-accent)',
              border: '1px solid rgba(90,218,238,0.20)',
            }}
          >
            Core
          </span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={`Members \u00b7 ${members.length}`}>
        {members.length === 0 ? (
          <div
            className="flex items-center justify-center h-20 rounded-[10px] text-[12px] text-[var(--hotbox-text-dim)]"
            style={{ border: '1px dashed var(--hotbox-border)' }}
          >
            No members found
          </div>
        ) : (
          <div>{members.map((m) => <MemberRow key={m.id} member={m} />)}</div>
        )}
      </SettingsSection>

      {isHeadmaster && (
        <SettingsSection title="Invitations">
          <SettingsRow
            label="Invite a new member"
            description="Generate a single-use link, valid for 72 hours"
          >
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-medium text-[var(--hotbox-text)] hover:bg-[var(--hotbox-surface-hover)] transition-colors"
              style={{ border: '1px solid var(--hotbox-border)' }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              Generate invite link
            </button>
          </SettingsRow>
        </SettingsSection>
      )}

      {dirty && isHeadmaster && (
        <div
          className="sticky bottom-4 flex justify-end gap-3 p-3 rounded-[10px]"
          style={{ background: 'var(--hotbox-surface-2)', border: '1px solid var(--hotbox-border-strong)', boxShadow: 'var(--hotbox-shadow-lg)' }}
        >
          <button
            onClick={() => setOrgName(workspace?.orgName ?? '')}
            className="px-4 py-1.5 rounded-[7px] text-[12px] text-[var(--hotbox-text-muted)] hover:text-[var(--hotbox-text)]"
          >
            Discard
          </button>
          <SettingsSaveBtn dirty={dirty} loading={saving} onClick={save} />
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
