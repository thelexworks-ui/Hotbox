'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContext {
  memberId: string;
  org: string;
  role: string;
  name: string;
  ready: boolean;
  logout: () => Promise<void>;
}

const PENDING_LOGOUT_KEY = 'pending-logout';

async function doLogout() {
  const attempt = () => fetch('/api/auth/logout', { method: 'POST' });
  try {
    await attempt();
  } catch {
    // First attempt failed — wait 500ms and retry once
    await new Promise<void>((r) => setTimeout(r, 500));
    try {
      await attempt();
    } catch {
      // Both attempts failed: set flag so AuthProvider clears session on next page load
      localStorage.setItem(PENDING_LOGOUT_KEY, 'true');
    }
  }
  window.location.href = '/login';
}

const Ctx = createContext<AuthContext>({
  memberId: 'user:local',
  org: process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage',
  role: '',
  name: '',
  ready: false,
  logout: doLogout,
});

export function useAuth(): AuthContext {
  return useContext(Ctx);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthContext>({
    memberId: 'user:local',
    org: process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage',
    role: '',
    name: '',
    ready: false,
    logout: doLogout,
  });

  useEffect(() => {
    // Pending-logout flag: a prior logout attempt failed on the network.
    // Retry the server-side clear now, then force /login regardless.
    if (localStorage.getItem(PENDING_LOGOUT_KEY) === 'true') {
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(() => { /* best-effort on retry */ })
        .finally(() => {
          localStorage.removeItem(PENDING_LOGOUT_KEY);
          window.location.href = '/login';
        });
      return;
    }

    fetch('/api/hotbox/me')
      .then(async (r) => {
        if (!r.ok) {
          setAuth((prev) => ({ ...prev, ready: true }));
          return;
        }
        const data: Partial<{ memberId: string; org: string; role: string; name: string }> = await r.json();
        setAuth({
          memberId: data?.memberId || 'user:local',
          org: data?.org || '',
          role: data?.role || '',
          name: data?.name || '',
          ready: true,
          logout: doLogout,
        });
      })
      .catch(() => {
        setAuth((prev) => ({ ...prev, ready: true }));
      });
  }, []);

  return <Ctx.Provider value={auth}>{children}</Ctx.Provider>;
}
