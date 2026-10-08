/* Selection state (per channel and sale unit) and small hooks shared by the storefront and the box office. */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { now } from '../../lib/time';
import { emptySel, type Sel } from '../../domain/purchase';
import type { Channel, Scheme } from '../../domain/types';

type SelState = { sels: Record<string, Sel>; put: (k: string, s: Sel) => void; clear: (k: string) => void };

/** Kept for the browser session, so "choose other seats" and a reload bring the selection back. */
export const useSelStore = create<SelState>()(
  persist(
    (set) => ({
      sels: {},
      put: (k, s) => set((st) => ({ sels: { ...st.sels, [k]: s } })),
      clear: (k) =>
        set((st) => {
          const n = { ...st.sels };
          delete n[k];
          return { sels: n };
        }),
    }),
    { name: 'sayohat-sel', storage: createJSONStorage(() => sessionStorage) },
  ),
);

const EMPTY: Sel = emptySel();
export const selKey = (channel: Channel, sid: string) => `${channel}:${sid}`;
export const clearSel = (channel: Channel, sid: string) => useSelStore.getState().clear(selKey(channel, sid));

export function useSel(channel: Channel, sid: string): [Sel, (fn: (s: Sel) => Sel) => void] {
  const k = selKey(channel, sid);
  const s = useSelStore((st) => st.sels[k]) || EMPTY;
  const update = (fn: (s: Sel) => Sel) => {
    const st = useSelStore.getState();
    st.put(k, fn(st.sels[k] || emptySel()));
  };
  return [s, update];
}

/** Current (Tashkent, demo-clock aware) time, refreshed every `ms`. */
export function useNow(ms = 1000) {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

/**
 * A database copy pulled from another tab gives new scheme objects even when nothing in the plan changed;
 * keeping the old reference stops the plan from losing the buyer's zoom on every sale elsewhere.
 */
export function useStableScheme(sc: Scheme | null | undefined): Scheme | null {
  const ref = useRef<{ sig: string; sc: Scheme } | null>(null);
  if (!sc) return null;
  const sig = `${sc.w}|${sc.h}|${sc.cats.map((c) => c.id + c.color).join(',')}|${sc.els.map((e) => `${e.id}:${e.rev}:${e.x}:${e.y}:${e.rot}:${e.limit ?? ''}:${e.mode ?? ''}`).join(',')}`;
  if (!ref.current || ref.current.sig !== sig) ref.current = { sig, sc };
  return ref.current.sc;
}
