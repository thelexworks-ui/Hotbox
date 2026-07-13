export interface AegisEnvelope {
  v: 2;
  alg: 'aes-256-gcm';
  kid: string;        // chat_id (channel_id slug)
  iv: string;         // base64 12-byte per-message nonce
  ciphertext: string;
  tag: string;        // base64 16-byte GCM auth tag
  // epk intentionally absent — ephemeral public key lives in WrappedKeyBundle only (§6 fix)
}

export interface WrappedKeyBundle {
  wk: string;   // base64 AES-GCM ciphertext of wrapped CK
  epk: string;  // base64 raw X25519 ephemeral public key (for ECDH unwrap)
  wiv: string;  // base64 12-byte AES-GCM IV used during wrap — required for unwrap (§6 fix)
}

export interface HotboxMessage {
  id: string;
  org_id: string;
  channel_id: string;
  sender_id: string;
  content: null;
  crypto_envelope: AegisEnvelope;
  type: 'message';
  ts: string;
  thread_parent_id?: string;
  reactions?: Record<string, string[]>;
  thread_count?: number;
  // Client-only optimistic fields — never sent to or received from server:
  _pending?: boolean;
  _text?: string;
}

export interface SystemMessage {
  id: string;
  org_id: string;
  channel_id: string;
  sender_id: 'system';
  content: string;
  crypto_envelope?: never;
  type: 'system';
  ts: string;
}

export type AnyMessage = HotboxMessage | SystemMessage;

export type WsStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

// §5 Final — Server → Client message types
export type ServerMessageType =
  | 'hello'
  | 'msg.new'
  | 'msg.ack'
  | 'msg.updated'
  | 'msg.deleted'
  | 'msg.reaction'
  | 'typing'
  | 'presence'
  | 'channel.new'
  | 'member.join'
  | 'member.leave'
  | 'pong'
  | 'error'
  | 'key.rotated';

export interface ServerMessage {
  type: ServerMessageType;
  [key: string]: unknown;
}

// §5 Final — Client → Server message types
export interface ClientMessage {
  type:
    | 'msg.send'
    | 'msg.edit'
    | 'msg.delete'
    | 'msg.react'
    | 'channel.join'
    | 'channel.leave'
    | 'typing.start'
    | 'typing.stop'
    | 'presence.set'
    | 'replay'
    | 'ping';
  [key: string]: unknown;
}
