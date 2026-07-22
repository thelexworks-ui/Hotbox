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

async function doLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* best-effort */ }
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
