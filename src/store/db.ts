/*
 * The local "backend": one database object kept in localStorage, shared by every tab of the browser.
 * All writes go through tx(): it reads the latest copy (another tab may have sold a seat), applies the change and
 * saves, so the storefront in one tab and the box office in another share one stock (US-38).
 * Swap this module for HTTP calls to a real server without touching the screens: they only use tx()/useDb().
 */
import { useSyncExternalStore } from 'react';
import { safeLS } from '../lib/util';
import { setClockOffset } from '../lib/time';
import type { Db } from '../domain/types';

export const DB_KEY = 'sayohat-db-v2';
export const DB_VERSION = 2;

let db: Db | null = null;
let memo: Record<string, unknown> = {};
const listeners = new Set<() => void>();
let seedFn: (() => Db) | null = null;

/** The seed is registered by main.tsx, so this module has no import cycle with the demo data. */
export function registerSeed(fn: () => Db) {
  seedFn = fn;
}

function load(): Db | null {
  const s = safeLS('get', DB_KEY);
  if (!s) return null;
  try {
    const d = JSON.parse(s) as Db;
    return d && d.v === DB_VERSION ? d : null;
  } catch {
    return null;
  }
}
function emit() {
  for (const l of listeners) l();
}
function save() {
  if (!db) return;
  db.rev = (db.rev || 0) + 1;
  memo = {};
  safeLS('set', DB_KEY, JSON.stringify(db));
  emit();
}

export function initDb(force = false) {
  db = force ? null : load();
  if (!db) {
    if (!seedFn) throw new Error('seed not registered');
    db = seedFn();
    save();
  }
  setClockOffset(db.demo.clock || 0);
  memo = {};
  emit();
}

export function getDb(): Db {
  if (!db) initDb();
  return db as Db;
}

/** Pulls changes another tab saved. Returns true when something changed. */
export function refreshDb() {
  const d = load();
  if (d && db && d.rev !== db.rev) {
    db = d;
    memo = {};
    setClockOffset(db.demo.clock || 0);
    emit();
    return true;
  }
  return false;
}

/** Read latest → change → save, so concurrent tabs don't overwrite each other's sales. */
export function tx<T>(fn: (d: Db) => T): T {
  refreshDb();
  const r = fn(getDb());
  save();
  return r;
}

/** Caches a derived value until the next write. */
export function m<T>(key: string, fn: () => T): T {
  const k = getDb().rev + '|' + key;
  if (!(k in memo)) memo[k] = fn();
  return memo[k] as T;
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getRev = () => getDb().rev;

/** Re-renders the component on every database change (this tab or another one) and returns the database. */
export function useDb(): Db {
  useSyncExternalStore(subscribe, getRev);
  return getDb();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) refreshDb();
  });
}
