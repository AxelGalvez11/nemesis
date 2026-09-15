/**
 * Whether the phone can reach Nemesis right now (canvas Offline). There is no native network module in this
 * build, so the answer comes from a tiny request to the Supabase health endpoint: every 20 s while the app is in
 * front, and at once when it comes back to the front. Two misses in a row count as offline, so one slow request
 * does not flash the banner.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

async function reachable(): Promise<boolean> {
  if (!URL_BASE) return true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${URL_BASE}/auth/v1/health`, { headers: KEY ? { apikey: KEY } : undefined, signal: ctrl.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let misses = 0;
    let alive = true;
    const check = async () => {
      const ok = await reachable();
      if (!alive) return;
      misses = ok ? 0 : misses + 1;
      const next = ok || misses < 2;
      setOnline(next);
      onlineManager.setOnline(next);
    };
    void check();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void check();
    }, 20_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        misses = 1;
        void check();
      }
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return online;
}
