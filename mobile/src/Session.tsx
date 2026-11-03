import React, { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { restore, setOnExpired } from './api';

const Context = createContext({ email: null as string | null, boot: true, tick: 0, setEmail: (_email: string | null) => {} });
export function SessionProvider({ children }: PropsWithChildren) {
  const [email, setEmail] = useState<string | null>(null); const [boot, setBoot] = useState(true); const [tick, setTick] = useState(0);
  useEffect(() => { setOnExpired(() => setEmail(null)); restore().then(setEmail).catch(() => {}).finally(() => setBoot(false)); return () => setOnExpired(() => {}); }, []);
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state === 'active') setTick(v => v + 1); }); return () => sub.remove(); }, []);
  return <Context.Provider value={{ email, setEmail, boot, tick }}>{children}</Context.Provider>;
}
export const useSession = () => useContext(Context);
