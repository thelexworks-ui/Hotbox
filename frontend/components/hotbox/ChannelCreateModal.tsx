'use client';

import React, { useState } from 'react';
import { useMembers, type Member } from '@/hooks/useMembers';
import { MemberAvatar, RoleBadge } from './MembersPanel';
import type { ChannelMeta } from '@/store/hotbox';

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';

type ChannelType = 'topic' | 'group' | 'dm';

const TYPE_DESCRIPTIONS: Record<ChannelType, string> = {
  topic: 'A persistent channel for ongoing conversation around a topic.',
  group: 'A group message thread — good for focused collaboration.',
  dm: 'A direct message thread between specific people or agents.',
};

function TypeIcon({ type }: { type: ChannelType }) {
  if (type === 'topic') return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  );
  if (type === 'group') return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function SelectedChip({ member, onRemove }: { member: Member; onRemove(): void }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full border"
      style={{ background: 'var(--hotbox-surface-2)', borderColor: 'var(--hotbox-accent)', color: 'var(--hotbox-accent)' }}
    >
      <span className="text-xs font-medium">{member.name}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${member.name}`}
        style={{ color: 'var(--hotbox-text-muted)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text-muted)'; }}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

interface Props {
  onCreated(ch: ChannelMeta): void;
  onClose(): void;
}

export function ChannelCreateModal({ onCreated, onClose }: Props) {
  const allMembers = useMembers(30_000);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('topic');
  const [nameError, setNameError] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selected, setSelected] = useState<Member[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const filteredMembers = allMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  function handleNameInput(val: string) {
    const clean = val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    setName(clean);
    setNameError('');
  }

  function goToStep2() {
    if (!name.trim()) { setNameError('Channel name is required'); return; }
    setStep(2);
  }

  function toggle(m: Member) {
    setSelected((prev) =>
      prev.some((s) => s.id === m.id) ? prev.filter((s) => s.id !== m.id) : [...prev, m]
    );
  }

  async function submit(memberIds: string[]) {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/hotbox/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org: ORG, name, type, memberIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 409) {
          setCreateError(`A channel named #${name} already exists.`);
        } else if (res.status >= 500) {
          setCreateError('Something went wrong creating the channel. Try again or contact support.');
        } else {
          setCreateError(body.error ?? `Couldn't create the channel — check your connection and try again.`);
        }
        setCreating(false);
        return;
      }
      const ch = await res.json() as ChannelMeta;
      onCreated(ch);
    } catch {
      setCreateError(`Couldn't create the channel — check your connection and try again.`);
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-xl shadow-xl flex flex-col"
        style={{ background: 'var(--hotbox-surface)', border: '1px solid var(--hotbox-border)', maxHeight: '90vh' }}
      >
        {step === 1 ? (
          <>
            {/* Step 1 header */}
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--hotbox-text)' }}>New channel</h2>
              <button onClick={onClose} style={{ color: 'var(--hotbox-text-dim)' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text)'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text-dim)'; }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Step 1 body */}
            <div className="px-5 py-4 flex flex-col gap-4 flex-1 overflow-y-auto hotbox-scrollbar">
              {/* Channel name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--hotbox-text-muted)' }}>Channel name</label>
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150"
                  style={{ borderColor: nameError ? 'var(--hotbox-crashed)' : 'var(--hotbox-border)', background: 'var(--hotbox-surface-2)' }}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--hotbox-text-dim)', flexShrink: 0 }}>
                    <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
                  </svg>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. design-review"
                    value={name}
                    onChange={(e) => handleNameInput(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: 'var(--hotbox-text)' }}
                    maxLength={80}
                  />
                </div>
                {nameError && <span className="text-xs" style={{ color: 'var(--hotbox-crashed)' }}>{nameError}</span>}
              </div>

              {/* Channel type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--hotbox-text-muted)' }}>Type</label>
                <div className="flex gap-2">
                  {(['topic', 'group', 'dm'] as ChannelType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className="flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg border text-center transition-all duration-100"
                      style={{
                        borderColor: type === t ? 'var(--hotbox-accent)' : 'var(--hotbox-border)',
                        background: type === t ? 'var(--hotbox-surface-2)' : undefined,
                        color: type === t ? 'var(--hotbox-accent)' : 'var(--hotbox-text-muted)',
                      }}
                    >
                      <TypeIcon type={t} />
                      <span className="text-xs font-medium capitalize">{t}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs" style={{ color: 'var(--hotbox-text-dim)' }}>{TYPE_DESCRIPTIONS[type]}</p>
              </div>
            </div>

            {/* Step 1 footer */}
            <div className="px-5 py-4 border-t flex justify-end flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
              <button
                onClick={goToStep2}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-100"
                style={{
                  background: name.trim() ? 'var(--hotbox-accent)' : 'var(--hotbox-border)',
                  color: name.trim() ? '#fff' : 'var(--hotbox-text-dim)',
                  cursor: name.trim() ? 'pointer' : 'not-allowed',
                  opacity: name.trim() ? 1 : 0.5,
                }}
              >
                Add members
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2 header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
              <button onClick={() => setStep(1)} style={{ color: 'var(--hotbox-text-dim)' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text)'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text-dim)'; }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15,18 9,12 15,6"/></svg>
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold truncate" style={{ color: 'var(--hotbox-text)' }}>#{name}</h2>
                <p className="text-xs" style={{ color: 'var(--hotbox-text-dim)' }}>Add members</p>
              </div>
              <button onClick={onClose} style={{ color: 'var(--hotbox-text-dim)' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text)'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text-dim)'; }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
                {selected.map((m) => (
                  <SelectedChip key={m.id} member={m} onRemove={() => toggle(m)} />
                ))}
              </div>
            )}

            {/* Member search */}
            <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border" style={{ background: 'var(--hotbox-surface-2)', borderColor: 'var(--hotbox-border)' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--hotbox-text-dim)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search members"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--hotbox-text)' }}
                />
              </div>
            </div>

            {/* Member list */}
            <div className="overflow-y-auto flex-1 max-h-[280px] hotbox-scrollbar">
              {filteredMembers.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm" style={{ color: 'var(--hotbox-text-dim)' }}>
                  {memberSearch ? `No members match "${memberSearch}"` : 'No members available.'}
                </div>
              ) : filteredMembers.map((m) => {
                const isSelected = selected.some((s) => s.id === m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(m)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors duration-100"
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--hotbox-surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <MemberAvatar member={m} />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm truncate" style={{ color: 'var(--hotbox-text)' }}>{m.name}</span>
                        {(m.role === 'orchestrator' || m.role === 'headmaster') && <RoleBadge role={m.role} />}
                      </div>
                      <span className="text-xs capitalize" style={{ color: 'var(--hotbox-text-dim)' }}>
                        {['agent', 'orchestrator', 'headmaster'].includes(m.role) ? 'agent' : 'member'}
                      </span>
                    </div>
                    {/* Checkbox */}
                    <div
                      className="flex items-center justify-center flex-shrink-0 rounded border transition-all duration-100"
                      style={{
                        width: 20, height: 20,
                        background: isSelected ? 'var(--hotbox-accent)' : 'var(--hotbox-surface-2)',
                        borderColor: isSelected ? 'var(--hotbox-accent)' : 'var(--hotbox-border)',
                      }}
                    >
                      {isSelected && (
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Error */}
            {createError && (
              <div className="mx-5 mb-0 mt-2 px-3 py-2 rounded-lg border text-xs flex-shrink-0" style={{ background: 'rgba(242,63,67,0.1)', borderColor: 'rgba(242,63,67,0.3)', color: 'var(--hotbox-crashed)' }}>
                {createError}
              </div>
            )}

            {/* Step 2 footer */}
            <div className="px-5 py-4 border-t flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--hotbox-border)' }}>
              <span className="text-xs" style={{ color: 'var(--hotbox-text-dim)' }}>
                {selected.length > 0 ? `${selected.length} selected` : 'Select members to add'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => submit([])}
                  disabled={creating}
                  className="px-3 py-2 rounded-lg text-sm transition-colors duration-100"
                  style={{ color: 'var(--hotbox-text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hotbox-text-muted)'; }}
                >
                  Skip
                </button>
                <button
                  onClick={() => submit(selected.map((m) => m.id))}
                  disabled={creating}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-100"
                  style={{
                    background: 'var(--hotbox-accent)',
                    color: '#fff',
                    opacity: creating ? 0.6 : 1,
                    cursor: creating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? 'Creating…' : 'Create channel'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
