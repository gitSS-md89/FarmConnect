import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'fc_auth_token';

export async function saveToken(token: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(KEY, token);
  } else {
    await SecureStore.setItemAsync(KEY, token);
  }
}
export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(KEY);
  }
  return await SecureStore.getItemAsync(KEY);
}
export async function clearToken() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(KEY);
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export async function api(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: any = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = (data && data.detail) || `HTTP ${res.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}
