'use client';

import React, { useState } from 'react';

interface Props {
  onConfirm(): void;
}

export function KeyLossWarningModal({ onConfirm }: Props) {
  const [checked, setChecked] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-xl p-6 flex flex-col gap-4"
        style={{ background: 'var(--hotbox-surface)', border: '1px solid var(--hotbox-border)' }}
      >
        {/* Title */}
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5" aria-hidden>⚠️</span>
          <div>
            <h2 className="font-semibold text-base text-[var(--hotbox-text)]">
              Before your first message
            </h2>
            <p className="text-xs text-[var(--hotbox-text-dim)] mt-0.5">
              Your encryption keys are unique to this browser. Read carefully.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="text-sm text-[var(--hotbox-text)] leading-relaxed space-y-2">
          <p>
            Your encryption keys are generated and stored <strong>in this browser only</strong>.
            There is currently no recovery path.
          </p>
          <p>
            If you clear your browser data, switch browsers, or lose access to this device,
            your message history <strong>cannot be recovered</strong> — there is no seed phrase,
            no password reset, and no backup option available at this time.
          </p>
          <p className="text-[var(--hotbox-mention)] font-medium">
            You will lose all message history permanently if you lose access to these keys.
          </p>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer accent-[var(--hotbox-accent)]"
          />
          <span className="text-sm text-[var(--hotbox-text)]">
            I understand: clearing browser storage permanently deletes my decryption keys
            and I will lose access to all message history with no way to recover it.
          </span>
        </label>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={!checked}
          className={[
            'w-full rounded-lg py-2.5 text-sm font-semibold transition-colors',
            checked
              ? 'bg-[var(--hotbox-accent)] text-white hover:bg-[var(--hotbox-accent-hover)] cursor-pointer'
              : 'bg-[var(--hotbox-border)] text-[var(--hotbox-text-dim)] cursor-not-allowed',
          ].join(' ')}
        >
          I understand the risk — continue
        </button>
      </div>
    </div>
  );
}
