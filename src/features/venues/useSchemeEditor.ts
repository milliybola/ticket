/*
 * Working state of the seating-plan editor: a private copy of the hall plan, the selected element, seat-selection
 * mode and an undo/redo history. Nothing reaches the database until "Save": saving stores a NEW plan snapshot for
 * the hall, so plans already copied into events and sessions never change (US-06 rule 3, [Р1]).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { clone, uid } from '../../lib/util';
import { CAT_PALETTE, touch, validateScheme } from '../../domain/scheme';
import { tx3 } from '../../lib/i18n';
import type { Scheme, SchemeEl } from '../../domain/types';

export type ImportSummary = { file: string; ok: number; check: number; seats: number };

const HISTORY_MAX = 60;
const EMPTY: Scheme = { w: 1000, h: 640, cats: [], els: [] };

export function useSchemeEditor(initial: Scheme | undefined) {
  const base = useMemo(() => clone(initial) || clone(EMPTY), [initial]);
  const [sc, setScState] = useState<Scheme>(base);
  // The current plan is also kept in a ref: history steps are recorded outside React updaters (StrictMode calls
  // updaters twice, which would record every step twice).
  const scRef = useRef(sc);
  const setSc = (next: Scheme) => {
    scRef.current = next;
    setScState(next);
  };
  const [sel, setSel] = useState<string | null>(null);
  const [seatEdit, setSeatEdit] = useState(false);
  const [seatSel, setSeatSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [showErrs, setShowErrs] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState(0);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);

  const record = () => {
    past.current.push(JSON.stringify(scRef.current));
    if (past.current.length > HISTORY_MAX) past.current.shift();
    future.current = [];
  };

  /** Applies a change to a copy of the plan, keeping an undo step. `fn` may mutate the draft freely. */
  const change = useCallback((fn: (draft: Scheme) => void, opts: { refit?: boolean } = {}) => {
    record();
    const draft: Scheme = clone(scRef.current);
    fn(draft);
    setSc(draft);
    setDirty(true);
    if (opts.refit) setViewKey((k) => k + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Changes one element (by id) and bumps its revision so its seats are regenerated. */
  const changeEl = useCallback(
    (id: string, fn: (el: SchemeEl, draft: Scheme) => void) =>
      change((d) => {
        const el = d.els.find((e) => e.id === id);
        if (el) {
          fn(el, d);
          touch(el);
        }
      }),
    [change],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(JSON.stringify(scRef.current));
    setSc(JSON.parse(prev));
    setDirty(true);
    setSeatSel(new Set());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(JSON.stringify(scRef.current));
    setSc(JSON.parse(next));
    setDirty(true);
    setSeatSel(new Set());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Replaces the whole plan (SVG import, template). */
  const replace = useCallback((next: Scheme, from: string | null, sum: ImportSummary | null) => {
    record();
    setSc(next);
    setSel(null);
    setSeatEdit(false);
    setSeatSel(new Set());
    setDirty(true);
    setShowErrs(!!sum);
    setSummary(sum);
    setSrc(from);
    setViewKey((k) => k + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    past.current = [];
    future.current = [];
    setSc(clone(base));
    setSel(null);
    setSeatEdit(false);
    setSeatSel(new Set());
    setDirty(false);
    setShowErrs(false);
    setSummary(null);
    setSrc(null);
    setViewKey((k) => k + 1);
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = useCallback((id: string | null) => {
    setSel(id);
    setSeatEdit(false);
    setSeatSel(new Set());
  }, []);

  const errs = useMemo(() => validateScheme(sc), [sc]);
  const el = sel ? sc.els.find((e) => e.id === sel) || null : null;

  return {
    sc,
    /** Latest plan, also between renders (event handlers of drags). */
    scRef,
    el,
    sel,
    pick,
    seatEdit,
    setSeatEdit,
    seatSel,
    setSeatSel,
    dirty,
    setDirty,
    showErrs,
    setShowErrs,
    summary,
    src,
    viewKey,
    refit: () => setViewKey((k) => k + 1),
    errs,
    change,
    changeEl,
    replace,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
export type SchemeEditorState = ReturnType<typeof useSchemeEditor>;

/** Makes sure the plan has a "Lounge" category and returns its id. */
export function ensureLoungeCat(sc: Scheme) {
  if (!sc.cats.some((c) => c.id === 'lounge')) {
    const col = CAT_PALETTE.find((x) => !sc.cats.some((c) => c.color === x)) || CAT_PALETTE[2];
    sc.cats.push({ id: 'lounge', name: tx3('Launj', 'Лаунж', 'Lounge'), color: col });
  }
  return 'lounge';
}
/** Copy of an element placed next to the original, with a fresh id and a free name. */
export function duplicateEl(sc: Scheme, el: SchemeEl): SchemeEl {
  const c: SchemeEl = clone(el);
  c.id = uid('el');
  c.x = (el.x || 0) + 40;
  c.y = (el.y || 0) + 40;
  c.rev = 1;
  if (el.type === 'table') {
    const nums = sc.els.filter((e) => e.type === 'table').map((e) => parseInt(e.name, 10) || 0);
    c.name = String((nums.length ? Math.max(...nums) : 0) + 1);
  } else {
    let n = 2;
    const baseName = el.name.replace(/\s\d+$/, '');
    while (sc.els.some((e) => e.name.trim().toLowerCase() === `${baseName} ${n}`.toLowerCase())) n++;
    c.name = `${baseName} ${n}`;
  }
  return c;
}
