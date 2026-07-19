import { create } from 'zustand';
import type { AnyMessage, HotboxMessage } from '@/lib/hotbox/types';
export type { PresenceStatus } from '@/lib/hotbox/presence';
import type { PresenceStatus } from '@/lib/hotbox/presence';

export interface ChannelMeta {
  id: string;
  name: string;
  type: 'system' | 'agent' | 'topic' | 'group' | 'dm';
  org: string;
  agent_name?: string;
  agent_role?: 'orchestrator' | 'analyst' | 'agent';
  pinned: boolean;
  created_at: string;
  topic?: string;
  members: string[];
  unread?: number;
  mentionCount?: number;
}

interface HotboxState {
  channels: ChannelMeta[];
  messages: Record<string, AnyMessage[]>;
  activeChannelId: string | null;
  typingUsers: Record<string, string[]>;      // channelId → [agentName, ...]
  presence: Record<string, PresenceStatus>;   // agentName → status

  setChannels(channels: ChannelMeta[]): void;
  appendChannel(channel: ChannelMeta): void;
  setActiveChannel(id: string): void;
  appendMessage(channelId: string, msg: AnyMessage): void;
  setMessages(channelId: string, msgs: AnyMessage[]): void;
  setTyping(channelId: string, user: string, active: boolean): void;
  clearTyping(channelId: string): void;
  setPresence(agent: string, status: PresenceStatus): void;
  markRead(channelId: string): void;
  incrementMention(channelId: string): void;
  incrementThreadCount(channelId: string, messageId: string): void;
  reconcilePending(channelId: string, nonce: string, realMsg: AnyMessage): void;
  removeMessage(channelId: string, messageId: string): void;
  updateReaction(messageId: string, emoji: string, senderId: string, action: 'add' | 'remove'): void;
}

export const useHotboxStore = create<HotboxState>((set) => ({
  channels: [],
  messages: {},
  activeChannelId: null,
  typingUsers: {},
  presence: {},

  setChannels: (channels) => set({ channels }),

  appendChannel: (channel) =>
    set((s) => ({ channels: [...s.channels, channel] })),

  setActiveChannel: (id) =>
    set((s) => ({
      activeChannelId: id,
      channels: s.channels.map((c) => (c.id === id ? { ...c, unread: 0, mentionCount: 0 } : c)),
    })),

  appendMessage: (channelId, msg) =>
    set((s) => {
      const existing = s.messages[channelId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return {}; // dedup WS replay
      const channels = s.activeChannelId === channelId
        ? s.channels
        : s.channels.map((c) => (c.id === channelId ? { ...c, unread: (c.unread ?? 0) + 1 } : c));
      return {
        messages: { ...s.messages, [channelId]: [...existing, msg] },
        channels,
      };
    }),

  setMessages: (channelId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [channelId]: msgs } })),

  setTyping: (channelId, user, active) =>
    set((s) => {
      const prev = s.typingUsers[channelId] ?? [];
      const next = active
        ? Array.from(new Set(prev.concat(user)))
        : prev.filter((u) => u !== user);
      return { typingUsers: { ...s.typingUsers, [channelId]: next } };
    }),

  // Server drops all ephemeral typing state on disconnect; call on WS 'hello'
  // to mirror that reset client-side and prevent stale indicators post-reconnect.
  clearTyping: (channelId) =>
    set((s) => ({ typingUsers: { ...s.typingUsers, [channelId]: [] } })),

  setPresence: (agent, status) =>
    set((s) => ({ presence: { ...s.presence, [agent]: status } })),

  markRead: (channelId) =>
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channelId ? { ...c, unread: 0, mentionCount: 0 } : c)),
    })),

  incrementMention: (channelId) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId ? { ...c, mentionCount: (c.mentionCount ?? 0) + 1 } : c
      ),
    })),

  incrementThreadCount: (channelId, messageId) =>
    set((s) => {
      const msgs = s.messages[channelId];
      if (!msgs) return {};
      return {
        messages: {
          ...s.messages,
          [channelId]: msgs.map((m) =>
            m.id === messageId && m.type === 'message'
              ? { ...m, thread_count: (m.thread_count ?? 0) + 1 }
              : m
          ),
        },
      };
    }),

  // Swap optimistic message (id=nonce) with server-confirmed message
  reconcilePending: (channelId, nonce, realMsg) =>
    set((s) => {
      const msgs = s.messages[channelId];
      if (!msgs) return {};
      const idx = msgs.findIndex((m) => m.id === nonce);
      if (idx === -1) return {};
      const updated = [...msgs];
      updated[idx] = realMsg;
      return { messages: { ...s.messages, [channelId]: updated } };
    }),

  removeMessage: (channelId, messageId) =>
    set((s) => {
      const msgs = s.messages[channelId];
      if (!msgs) return {};
      return { messages: { ...s.messages, [channelId]: msgs.filter((m) => m.id !== messageId) } };
    }),

  updateReaction: (messageId, emoji, senderId, action) =>
    set((s) => {
      let found = false;
      const newMessages: Record<string, AnyMessage[]> = {};
      for (const [cid, msgs] of Object.entries(s.messages)) {
        newMessages[cid] = msgs.map((m): AnyMessage => {
          if (m.id !== messageId || m.type !== 'message') return m;
          found = true;
          const reactions = { ...(m.reactions ?? {}) };
          const current = reactions[emoji] ?? [];
          if (action === 'add') {
            reactions[emoji] = Array.from(new Set([...current, senderId]));
          } else {
            const next = current.filter((id) => id !== senderId);
            if (next.length === 0) delete reactions[emoji];
            else reactions[emoji] = next;
          }
          return { ...m, reactions } as HotboxMessage;
        });
      }
      return found ? { messages: newMessages } : {};
    }),
}));
