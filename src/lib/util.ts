export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 8) + (Date.now() % 46656).toString(36);
}
/** FNV-1a. */
export function hash32(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const clone = <T>(o: T): T => (o === undefined ? o : JSON.parse(JSON.stringify(o)));
export const byId = <T extends { id: string }>(arr: T[], id: string | null | undefined) => (id ? arr.find((x) => x.id === id) : undefined);
export const sumBy = <T>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0);
export function groupBy<T>(arr: T[], f: (x: T) => string) {
  const m: Record<string, T[]> = {};
  for (const x of arr) (m[f(x)] ||= []).push(x);
  return m;
}
export const uniq = <T>(arr: T[]) => [...new Set(arr)];
export const r1 = (v: number) => Math.round(v * 10) / 10;

export function safeLS(op: 'get' | 'set' | 'del', key: string, val?: string): string | null {
  try {
    if (op === 'get') return localStorage.getItem(key);
    if (op === 'set') localStorage.setItem(key, val ?? '');
    if (op === 'del') localStorage.removeItem(key);
  } catch {
    /* storage blocked: the app keeps working in memory */
  }
  return null;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Small CSV writer for report export (opens in Excel). */
export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
