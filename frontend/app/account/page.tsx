'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

function TopNav() {
  return (
    <nav className="hx-nav h-12 flex items-center px-4 gap-3 shrink-0">
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-[#5ADAEE] flex items-center justify-center shadow-[0_0_12px_rgba(90,218,238,0.35)]">
          <span className="text-[#050C14] font-bold text-[10px] font-mono">HX</span>
        </div>
        <span className="text-[#E8F4F8] font-semibold text-sm tracking-tight">Hotbox</span>
      </Link>
      <span className="text-[rgba(232,244,248,0.20)] text-xs font-mono">/</span>
      <span className="text-[rgba(232,244,248,0.50)] text-xs font-mono">Account</span>
      <div className="flex-1" />
      <Link href="/dashboard" className="text-[rgba(232,244,248,0.40)] text-xs font-mono hover:text-[rgba(232,244,248,0.70)] transition-colors">
        ← Dashboard
      </Link>
    </nav>
  )
}

function AvatarUpload({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'HX'
  return (
    <div className="flex items-center gap-5">
      <div className="relative group">
        <div className="w-16 h-16 rounded-2xl bg-[rgba(90,218,238,0.12)] border-2 border-[rgba(90,218,238,0.25)] flex items-center justify-center shadow-[0_0_20px_rgba(90,218,238,0.12)]">
          <span className="text-[#5ADAEE] text-xl font-bold font-mono">{initials}</span>
        </div>
      </div>
      <div>
        <p className="text-[#E8F4F8] font-semibold text-sm">{name || 'Unnamed'}</p>
        <p className="text-[rgba(232,244,248,0.35)] text-xs font-mono mt-0.5">Avatar upload coming soon</p>
      </div>
    </div>
  )
}

const EyeIcon = () => (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

export default function AccountPage() {
  const [displayName,   setDisplayName]   = useState('')
  const [email,         setEmail]         = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [profileSaved,  setProfileSaved]  = useState(false)
  const [profileError,  setProfileError]  = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [currentPw,   setCurrentPw]   = useState('')
  const [newPw,       setNewPw]       = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [pwSaved,     setPwSaved]     = useState(false)
  const [pwError,     setPwError]     = useState<string | null>(null)
  const [pwLoading,   setPwLoading]   = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    fetch('/api/hotbox/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setDisplayName(d.name ?? '')
          setEmail(d.email ?? '')
          setEmailVerified(!!d.emailVerifiedAt)
        }
      })
      .catch(() => {})
  }, [])

  const pwScore = newPw.length === 0 ? 0
    : newPw.length < 6 ? 1
    : newPw.length < 10 ? 2
    : /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) ? 4
    : 3
  const pwColors = ['', '#FF4D4D', '#FFAF2A', '#5ADAEE', '#5ADAEE']
  const pwLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  async function handleProfileSave() {
    setProfileError(null)
    setProfileLoading(true)
    try {
      const res = await fetch('/api/hotbox/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName.trim() }),
      })
      if (res.ok) {
        setProfileSaved(true)
        setTimeout(() => setProfileSaved(false), 3000)
      } else {
        const d = await res.json() as { error?: string }
        setProfileError(d.error ?? 'Failed to save profile')
      }
    } catch {
      setProfileError('Network error — please try again')
    } finally {
      setProfileLoading(false)
    }
  }

  async function handlePasswordUpdate() {
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwError(null)
    setPwLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      if (res.ok) {
        setPwSaved(true)
        setCurrentPw(''); setNewPw(''); setConfirmPw('')
        setTimeout(() => setPwSaved(false), 3000)
      } else {
        const d = await res.json() as { error?: string }
        setPwError(d.error ?? 'Failed to update password')
      }
    } catch {
      setPwError('Network error — please try again')
    } finally {
      setPwLoading(false)
    }
  }

  const pwDisabled = pwLoading || !currentPw || !newPw || newPw !== confirmPw

  return (
    <div className="min-h-screen bg-[#050C14] flex flex-col">
      <TopNav />

      <div className="flex-1 flex justify-center px-4 py-8">
        <div className="w-full max-w-xl space-y-4">

          {/* Profile */}
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <h2 className="text-[#E8F4F8] text-base font-semibold tracking-tight">Profile</h2>

            <AvatarUpload name={displayName || 'User'} />

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Display name
              </label>
              <input
                type="text"
                name="displayName"
                autoComplete="name"
                value={displayName}
                onChange={e => { setDisplayName(e.target.value); setProfileSaved(false) }}
                className="hx-input w-full rounded-lg px-4 py-3 text-sm"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Email
              </label>
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[rgba(5,12,20,0.40)] border border-[rgba(90,218,238,0.10)]">
                <span className="text-[rgba(232,244,248,0.55)] text-sm font-mono truncate">{email || '—'}</span>
                {emailVerified && (
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(90,218,238,0.08)] border border-[rgba(90,218,238,0.18)] shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5ADAEE]" />
                    <span className="text-[#5ADAEE] text-[10px] font-mono">Verified</span>
                  </span>
                )}
              </div>
              <p className="text-[rgba(232,244,248,0.25)] text-xs font-mono mt-1.5">Email cannot be changed after verification.</p>
            </div>

            {profileError && <p className="text-[#FF4D4D] text-xs px-1">{profileError}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleProfileSave}
                disabled={profileLoading}
                className="hx-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {profileLoading ? 'Saving…' : 'Save profile'}
              </button>
              {profileSaved && (
                <span className="text-[#5ADAEE] text-xs font-mono flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l2.8 3L10 2" stroke="#5ADAEE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </div>

          {/* Change password */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="text-[#E8F4F8] text-base font-semibold tracking-tight">Change password</h2>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Current password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  name="current-password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={currentPw}
                  onChange={e => { setCurrentPw(e.target.value); setPwSaved(false); setPwError(null) }}
                  className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
                >
                  <EyeIcon />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                New password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPw}
                  onChange={e => { setNewPw(e.target.value); setPwSaved(false); setPwError(null) }}
                  className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
                >
                  <EyeIcon />
                </button>
              </div>
              {pwScore > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4].map(b => (
                      <div key={b} className="flex-1 h-0.5 rounded-full transition-all duration-300"
                        style={{ background: b <= pwScore ? pwColors[pwScore] : 'rgba(232,244,248,0.10)' }} />
                    ))}
                  </div>
                  <p className="text-xs font-mono" style={{ color: pwColors[pwScore] }}>{pwLabels[pwScore]}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[rgba(232,244,248,0.60)] text-xs font-mono uppercase tracking-widest mb-2">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  name="confirm-password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setPwSaved(false); setPwError(null) }}
                  className="hx-input w-full rounded-lg px-4 py-3 text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(232,244,248,0.35)] hover:text-[rgba(232,244,248,0.65)] transition-colors"
                >
                  <EyeIcon />
                </button>
              </div>
              {confirmPw && newPw && confirmPw !== newPw && (
                <p className="text-[#FF4D4D] text-xs font-mono mt-1.5">Passwords don&apos;t match.</p>
              )}
            </div>

            {pwError && <p className="text-[#FF4D4D] text-xs px-1">{pwError}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handlePasswordUpdate}
                disabled={pwDisabled}
                className="hx-btn-primary rounded-lg px-5 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {pwLoading ? 'Updating…' : 'Update password'}
              </button>
              {pwSaved && (
                <span className="text-[#5ADAEE] text-xs font-mono flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l2.8 3L10 2" stroke="#5ADAEE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Password updated
                </span>
              )}
            </div>
          </div>

          {/* Danger zone */}
          <div className="glass-card rounded-2xl p-6 border border-[rgba(255,77,77,0.15)]">
            <h2 className="text-[rgba(232,244,248,0.80)] text-base font-semibold tracking-tight mb-1">Danger zone</h2>
            <p className="text-[rgba(232,244,248,0.35)] text-xs mb-4">These actions are irreversible.</p>
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="hx-btn-ghost rounded-lg px-4 py-2 text-sm border-[rgba(255,77,77,0.25)] text-[rgba(255,77,77,0.70)] hover:text-[#FF4D4D] hover:border-[rgba(255,77,77,0.50)] transition-colors"
              >
                Delete account
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[rgba(232,244,248,0.50)] text-xs">Are you sure? This cannot be undone.</span>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="hx-btn-ghost rounded-lg px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-xs bg-[rgba(255,77,77,0.15)] border border-[rgba(255,77,77,0.35)] text-[#FF4D4D] hover:bg-[rgba(255,77,77,0.25)] transition-colors"
                >
                  Confirm delete
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
