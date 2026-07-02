import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, saveToken, clearToken } from '@/src/lib/api';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  provider?: string;
  subscription?: { active: boolean; plan?: string | null; renews_at?: string | null };
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { setUser(null); return; }
      const me = await api('/me');
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Web: check for session_id in URL hash/query
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const m = hash.match(/session_id=([^&]+)/) || search.match(/session_id=([^&]+)/);
        if (m) {
          try {
            const r = await api('/auth/google/session', { method: 'POST', body: JSON.stringify({ session_id: m[1] }) });
            await saveToken(r.token);
            setUser(r.user);
            window.history.replaceState(null, '', window.location.pathname);
          } catch (e) { console.warn(e); }
        }
      }
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    await saveToken(r.token);
    setUser(r.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const r = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    await saveToken(r.token);
    setUser(r.user);
  };

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    await clearToken();
    setUser(null);
  };

  const loginWithGoogle = async () => {
    const redirect = Platform.OS === 'web'
      ? (typeof window !== 'undefined' ? window.location.origin + '/' : '/')
      : Linking.createURL('auth');
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    if (result.type !== 'success' || !result.url) return;
    const m = result.url.match(/session_id=([^&]+)/);
    if (!m) return;
    const r = await api('/auth/google/session', { method: 'POST', body: JSON.stringify({ session_id: m[1] }) });
    await saveToken(r.token);
    setUser(r.user);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, loginWithGoogle, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
