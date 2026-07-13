'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContext {
  memberId: string;
  org: string;
  ready: boolean;
}

const Ctx = createContext<AuthContext>({
  memberId: 'user:local',
  org: process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage',
  ready: false,
});

export function useAuth(): AuthContext {
  return useContext(Ctx);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthContext>({
    memberId: 'user:local',
    org: process.env.NEXT_PUBLIC_HOTBOX_ORG || 'toadsage',
    ready: false,
  });

  useEffect(() => {
    fetch('/api/hotbox/me')
      .then((r) => r.json())
      .then((data: Partial<{ memberId: string; org: string }>) => {
        // Guard: fall back to safe defaults if the response shape is unexpected.
        // memberId must be a non-empty string — it becomes an IDB key.
        setAuth({
          memberId: data?.memberId || 'user:local',
          org: data?.org || 'toadsage',
          ready: true,
        });
      })
      .catch(() => {
        // Non-fatal: keep defaults, mark ready so UI doesn't hang
        setAuth((prev) => ({ ...prev, ready: true }));
      });
  }, []);

  return <Ctx.Provider value={auth}>{children}</Ctx.Provider>;
}
