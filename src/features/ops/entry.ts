/* Entry check helpers (US-41, US-42): QR decoding, sounds and vibration, the list downloaded for offline work. */
import jsQR from 'jsqr';
import { t3, tl } from '../../lib/i18n';
import { dateKey, fmtDate, hhmm, now, relDay } from '../../lib/time';
import { safeLS } from '../../lib/util';
import { evTitle, getVenue, hallOf, parseSid, type EntryCtx } from '../../domain/rules';
import type { Ticket } from '../../domain/types';
import { getDb } from '../../store/db';

export type Tone = 'ok' | 'warn' | 'err';

let audio: AudioContext | null = null;
/** Short beeps, different per result: one high for "pass", two middle for "check", a low buzz for "stop". */
export function beep(kind: Tone) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = audio || new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    const plan: [number, number, number, OscillatorType][] =
      kind === 'ok'
        ? [[0, 0.12, 1320, 'sine']]
        : kind === 'warn'
          ? [
              [0, 0.1, 760, 'triangle'],
              [0.16, 0.1, 760, 'triangle'],
            ]
          : [[0, 0.38, 180, 'square']];
    const t0 = audio.currentTime + 0.01;
    for (const [at, dur, freq, type] of plan) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(audio.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  } catch {
    /* no audio: the colour still tells the result */
  }
  try {
    navigator.vibrate?.(kind === 'ok' ? 80 : kind === 'warn' ? [60, 60, 60] : [300, 100, 300]);
  } catch {
    /* no vibration */
  }
}

/** Reads a QR code from pixels. */
export function decodePixels(img: ImageData): string | null {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return r?.data || null;
}

/** Reads a QR code from a photo (tries the full size and a smaller copy: big phone photos decode better scaled down). */
export async function decodeFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    for (const max of [1200, 800, 2000, 500]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(img, 0, 0, w, h);
      const code = decodePixels(g.getImageData(0, 0, w, h));
      if (code) return code;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "sy123456", "SY 123456" → "SY-123456". */
export const normOrderNo = (q: string) => q.trim().toUpperCase().replace(/\s+/g, '').replace(/^SY-?(\d)/, 'SY-$1');

export function ctxLabel(c: EntryCtx) {
  if (c.museum) return `${evTitle(c.ev)} · ${relDay(c.date!) || fmtDate(c.date!)}`;
  const v = getVenue(c.ev.venueId);
  const hall = v && v.halls.length > 1 ? ' · ' + (hallOf(v, c.session?.hallId)?.name || '') : '';
  return `${evTitle(c.ev)} · ${relDay(dateKey(c.startsAt)) || fmtDate(c.startsAt)}, ${hhmm(c.startsAt)}${hall}`;
}

/** Default session: the nearest one today, else the next one. */
export function defaultCtx(list: EntryCtx[]): EntryCtx | null {
  const t = dateKey(now());
  const today = list.filter((c) => dateKey(c.startsAt) === t);
  const pool = today.length ? today : list.filter((c) => c.startsAt > now());
  if (!pool.length) return list[list.length - 1] || null;
  return pool.slice().sort((a, b) => Math.abs(a.startsAt - now()) - Math.abs(b.startsAt - now()))[0];
}

export const inCtx = (t: Ticket, c: EntryCtx) => (c.museum ? t.ev === c.ev.id && (parseSid(t.sid) as { date?: string }).date === c.date : t.sid === c.key);

// ---------------------------------------------------------------- offline list

export type QueueItem = { tid: string; at: number; kind: 'pass' | 'deny' };
export type Offline = { at: number; tickets: Record<string, Ticket>; queue: QueueItem[] };

const key = (orgId: string) => `sayohat-entry-${orgId}`;
/** The organizer's tickets as this phone downloaded them. */
export function buildList(orgId: string, prev?: Offline | null): Offline {
  const d = getDb();
  const evIds = new Set(d.events.filter((e) => e.orgId === orgId).map((e) => e.id));
  const tickets: Record<string, Ticket> = {};
  for (const t of d.tickets) if (evIds.has(t.ev)) tickets[t.id] = JSON.parse(JSON.stringify(t));
  return { at: now(), tickets, queue: prev?.queue || [] };
}
export function loadList(orgId: string): Offline | null {
  try {
    const s = safeLS('get', key(orgId));
    return s ? (JSON.parse(s) as Offline) : null;
  } catch {
    return null;
  }
}
export function saveList(orgId: string, l: Offline) {
  safeLS('set', key(orgId), JSON.stringify(l));
}

export const resultTone = (res: string): Tone => (res === 'ok' ? 'ok' : res === 'confirm' || res === 'early' ? 'warn' : 'err');
export const ticketType = (t: Ticket) => tl(t.tn);
export const offlineText = (at: number | null) => t3('Aloqa yoʻq, roʻyxat {t} da yangilangan', 'Нет связи, список обновлён в {t}', 'Offline, list updated at {t}', { t: at ? hhmm(at) : '—' });
