/* Seating plans: model, seat generation, geometry, validation, labels and SVG import with sector recognition. */
import { t3, tx3, tl, type L10n } from '../lib/i18n';
import { clamp, r1, sumBy, uid } from '../lib/util';
import type { BBox, ElType, RawSeat, Scheme, SchemeEl, Seat, SeatCat, Shape } from './types';
import { arenaScheme, type ArenaLayout } from './arena';

export const SEAT_GAP = 16;
export const ROW_GAP = 18;
export const SEAT_R = 6;
const PAD = 12;
export const CAT_PALETTE = ['#3D7DD8', '#E0A21B', '#9B5DE5', '#E05780', '#1FA187', '#C2662D', '#5B6B8C', '#7FA32A', '#D64545', '#2E9BB8'];
export const SELLABLE: ElType[] = ['seats', 'lounge', 'fan', 'table'];
export const SEATED: ElType[] = ['seats', 'lounge', 'table'];

export function defaultCats(vipOnly = false): SeatCat[] {
  const c: SeatCat[] = [
    { id: 'std', name: tx3('Oddiy', 'Обычное', 'Standard'), color: CAT_PALETTE[0] },
    { id: 'vip', name: tx3('VIP', 'VIP', 'VIP'), color: CAT_PALETTE[1] },
  ];
  return vipOnly ? [c[1]] : c;
}
export const newScheme = (): Scheme => ({ w: 1000, h: 640, cats: defaultCats(), els: [] });
export const catOf = (sc: Pick<Scheme, 'cats'>, id: string | undefined): SeatCat =>
  sc.cats.find((c) => c.id === id) || sc.cats[0] || { id: 'std', name: tx3('Oddiy', 'Обычное', 'Standard'), color: CAT_PALETTE[0] };

export function elTypeName(type: ElType) {
  return {
    seats: t3('Joyli sektor', 'Сектор с местами', 'Seated sector'),
    lounge: t3('Launj', 'Лаунж', 'Lounge'),
    fan: t3('Fan-zona', 'Фан-зона', 'Fan zone'),
    table: t3('Stol', 'Стол', 'Table'),
    stage: t3('Sahna yoki ekran', 'Сцена или экран', 'Stage or screen'),
    unknown: t3('Aniqlanmadi', 'Не распознано', 'Not recognized'),
  }[type];
}

// ---------------------------------------------------------------- row labels and numbering

/** 0 → A, 25 → Z, 26 → AA. */
export function alpha(i: number) {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
/** Label of the i-th row (0-based) of an element. */
export function rowLabelOf(el: SchemeEl, i: number): number | string {
  const start = el.rowStart || 1;
  return el.rowLabels === 'alpha' ? alpha(start - 1 + i) : start + i;
}
/** Seat number at position j (0-based, left to right) in a row of `count` seats. */
export function seatNumberAt(el: SchemeEl, j: number, count: number) {
  const base = (el.seatStart || 1) - 1;
  if (el.numbering === 'rtl') return base + count - j;
  if (el.numbering === 'oddeven') {
    const left = Math.ceil(count / 2);
    return j < left ? base + 2 * (left - 1 - j) + 1 : base + 2 * (j - left) + 2;
  }
  return base + j + 1;
}

// ---------------------------------------------------------------- seats

export const tableRadius = (n: number) => 14 + n * 1.6;
export function tableSeatPos(n: number, k: number) {
  const R = 16 + n * 1.6 + 10;
  const a = (2 * Math.PI * k) / n - Math.PI / 2;
  return { x: Math.cos(a) * R, y: Math.sin(a) * R };
}

type GridSlot = { id: string; row: number | string; n: number; x: number; y: number };

/** Extra offset of the n-th row caused by walkways before it. */
const rowShift = (el: SchemeEl, i: number) => (el.rowAisles || []).filter((r) => i >= r).length * (el.aisleGap || el.rowGap || ROW_GAP);
const deg = (d: number) => (d * Math.PI) / 180;

/** Arc layout: radius of row i. */
export const arcRowR = (el: SchemeEl, i: number) => (el.arcR || 120) + i * (el.rowGap || ROW_GAP) + rowShift(el, i);
/** Arc layout: the seats a row can hold between the two angles, skipping aisle bands. Angles in radians. */
function arcRowAngles(el: SchemeEl, i: number): number[] {
  const g = el.seatGap || SEAT_GAP;
  const ag = el.aisleGap || g;
  const R = arcRowR(el, i);
  let a0 = deg(el.arcFrom ?? 200);
  let a1 = deg(el.arcTo ?? 340);
  if (a1 < a0) [a0, a1] = [a1, a0];
  const step = g / R;
  const usable = a1 - a0 - step; // half a seat of margin at both ends
  if (usable < 0) return [a0 + (a1 - a0) / 2];
  const n = Math.floor(usable / step) + 1;
  const start = a0 + (a1 - a0 - (n - 1) * step) / 2;
  const bands = (el.aisles || []).map((d) => deg(d));
  const half = (ag / 2 + g / 2) / R;
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    const t = start + j * step;
    if (bands.some((b) => Math.abs(t - b) < half)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Positions of all slots of a generated sector (removed ones included).
 * Grid: straight rows with alignment, curve, vertical aisles (aligned by column) and walkways between rows.
 * Arc: rows are arcs around the element origin; seats fill the angle span, so outer rows hold more seats.
 */
export function gridSlots(el: SchemeEl): GridSlot[] {
  const rows = el.rows || [];
  if (!rows.length) return [];
  const g = el.seatGap || SEAT_GAP;
  const rg = el.rowGap || ROW_GAP;
  const out: GridSlot[] = [];
  if (el.layout === 'arc') {
    rows.forEach((_, i) => {
      const row = rowLabelOf(el, i);
      const R = arcRowR(el, i);
      const angles = arcRowAngles(el, i);
      angles.forEach((t, j) => {
        const n = seatNumberAt(el, j, angles.length);
        out.push({ id: `${row}|${n}`, row, n, x: r1(R * Math.cos(t)), y: r1(R * Math.sin(t)) });
      });
    });
    return out;
  }
  const ag = el.aisleGap || g;
  const aisles = (el.aisles || []).slice().sort((x, y) => x - y);
  const max = Math.max(...rows);
  const width = (max - 1) * g + aisles.filter((a) => a < max).length * ag;
  const cx = width / 2;
  const curve = clamp(el.curve || 0, -180, 180);
  // Rows bend around a centre above the first row (the stage side), so their ends turn towards the stage.
  const R = curve ? Math.max(width, g) / ((Math.abs(curve) * Math.PI) / 180) : 0;
  rows.forEach((count, i) => {
    const row = rowLabelOf(el, i);
    const offCols = el.align === 'left' ? 0 : el.align === 'right' ? max - count : (max - count) / 2;
    for (let j = 0; j < count; j++) {
      const n = seatNumberAt(el, j, count);
      const col = offCols + j;
      // an aisle "after seat a" opens a gap before every seat whose column is a or more: columns stay aligned across rows
      let x = col * g + aisles.filter((a) => col >= a - 0.25).length * ag;
      let y = i * rg + rowShift(el, i);
      if (curve) {
        const Ri = R + y;
        const phi = (x - cx) / Ri;
        const sign = curve > 0 ? 1 : -1;
        x = cx + Ri * Math.sin(phi);
        y = y + sign * (Ri * Math.cos(phi) - Ri);
      }
      out.push({ id: `${row}|${n}`, row, n, x: r1(x), y: r1(y) });
    }
  });
  return out;
}

/** Where to draw each row's label: left of the first seat (grid) or before the start of the arc. */
export function rowLabelPoints(el: SchemeEl): { row: string; x: number; y: number; anchor: 'end' | 'middle' }[] {
  const ss = seatsOf(el);
  if (!el.rows || !el.rows.length) return [];
  const byRow = new Map<string, Seat[]>();
  for (const s of ss) {
    const k = String(s.row);
    if (!byRow.has(k)) byRow.set(k, []);
    byRow.get(k)!.push(s);
  }
  const out: { row: string; x: number; y: number; anchor: 'end' | 'middle' }[] = [];
  if (el.layout === 'arc') {
    const g = el.seatGap || SEAT_GAP;
    el.rows.forEach((_, i) => {
      const row = String(rowLabelOf(el, i));
      const list = byRow.get(row);
      if (!list || !list.length) return;
      const R = arcRowR(el, i);
      // angles normalised to the sector's own range, so a sector crossing 0° still finds its first seat
      const a0 = Math.min(deg(el.arcFrom ?? 200), deg(el.arcTo ?? 340));
      const norm = (v: number) => {
        let x = v;
        while (x < a0 - 0.3) x += 2 * Math.PI;
        while (x > a0 + 2 * Math.PI - 0.3) x -= 2 * Math.PI;
        return x;
      };
      const t = Math.min(...list.map((st) => norm(Math.atan2(st.y, st.x))));
      const tt = t - (g * 1.1) / R;
      out.push({ row, x: r1(R * Math.cos(tt)), y: r1(R * Math.sin(tt) + 3), anchor: 'middle' });
    });
    return out;
  }
  for (const [row, list] of byRow) {
    const f = list.reduce((a, b) => (b.x < a.x ? b : a));
    out.push({ row, x: r1(f.x - 11), y: r1(f.y + 3), anchor: 'end' });
  }
  return out;
}

/** Outline of an arc sector: a ring wedge around the element origin. */
export function arcFramePath(el: SchemeEl, pad = 12) {
  const n = (el.rows || []).length || 1;
  const r0 = Math.max(4, arcRowR(el, 0) - pad);
  const r1v = arcRowR(el, n - 1) + pad;
  let a0 = deg(el.arcFrom ?? 200);
  let a1 = deg(el.arcTo ?? 340);
  if (a1 < a0) [a0, a1] = [a1, a0];
  const P = (r: number, t: number) => `${r1(r * Math.cos(t))} ${r1(r * Math.sin(t))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${P(r0, a0)} L${P(r1v, a0)} A${r1(r1v)} ${r1(r1v)} 0 ${large} 1 ${P(r1v, a1)} L${P(r0, a1)} A${r1(r0)} ${r1(r0)} 0 ${large} 0 ${P(r0, a0)} Z`;
}
/** Point where an element's name and price are written in the sector overview. */
export function labelPoint(el: SchemeEl): { x: number; y: number } {
  if (el.layout === 'arc' && el.rows && el.rows.length) {
    const t = deg(((el.arcFrom ?? 200) + (el.arcTo ?? 340)) / 2);
    const r = (arcRowR(el, 0) + arcRowR(el, el.rows.length - 1)) / 2;
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  }
  const b = localBox(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

const seatCache = new WeakMap<SchemeEl, { rev: number; seats: Seat[] }>();
/** All (non-removed) seats of an element in element-local coordinates. */
export function seatsOf(el: SchemeEl): Seat[] {
  const c = seatCache.get(el);
  if (c && c.rev === el.rev) return c.seats;
  const out: Seat[] = [];
  const removed = new Set(el.removed || []);
  const sc = el.seatCat || {};
  const cat = el.cat || 'std';
  if (el.type === 'table') {
    const n = el.tableSeats || 0;
    for (let k = 1; k <= n; k++) {
      const p = tableSeatPos(n, k - 1);
      out.push({ key: `${el.id}|T|${k}`, row: 'T', n: k, x: p.x, y: p.y, cat });
    }
  } else if (el.rows && el.rows.length) {
    for (const s of gridSlots(el)) {
      if (removed.has(s.id)) continue;
      out.push({ key: `${el.id}|${s.id}`, row: s.row, n: s.n, x: s.x, y: s.y, cat: sc[s.id] || cat });
    }
  } else if (el.pts) {
    for (const s of el.pts) {
      const id = `${s.r}|${s.n}`;
      if (removed.has(id)) continue;
      out.push({ key: `${el.id}|${id}`, row: s.r, n: s.n, x: s.x, y: s.y, cat: sc[id] || cat });
    }
  }
  seatCache.set(el, { rev: el.rev, seats: out });
  return out;
}
export function touch(el: SchemeEl) {
  el.rev = (el.rev || 0) + 1;
}
/** Removed seat slots (to show and restore in the editor). */
export function removedSlots(el: SchemeEl): GridSlot[] {
  if (!el.removed || !el.removed.length) return [];
  const set = new Set(el.removed);
  if (el.rows && el.rows.length) return gridSlots(el).filter((s) => set.has(s.id));
  if (el.pts) return el.pts.filter((s) => set.has(`${s.r}|${s.n}`)).map((s) => ({ id: `${s.r}|${s.n}`, row: s.r, n: s.n, x: s.x, y: s.y }));
  return [];
}
export const seatCount = (el: SchemeEl) => (SEATED.includes(el.type) ? seatsOf(el).length : 0);
export const sellables = (sc: Scheme) => sc.els.filter((e) => SELLABLE.includes(e.type));
export const capacityOf = (sc: Scheme) => sumBy(sellables(sc), (e) => (e.type === 'fan' ? e.limit || 0 : seatCount(e)));
export function catsUsed(sc: Scheme): SeatCat[] {
  const s = new Set<string>();
  for (const el of sc.els) {
    if (el.type === 'fan') s.add(el.cat || 'std');
    else if (SEATED.includes(el.type)) for (const st of seatsOf(el)) s.add(st.cat);
  }
  return sc.cats.filter((c) => s.has(c.id));
}
/** Finds a seat by its key ('elId|row|n') in a plan. */
export function findSeat(sc: Scheme, key: string): { el: SchemeEl; seat: Seat } | null {
  const elId = key.split('|')[0];
  const el = sc.els.find((e) => e.id === elId);
  if (!el) return null;
  const seat = seatsOf(el).find((s) => s.key === key);
  return seat ? { el, seat } : null;
}

// ---------------------------------------------------------------- geometry

export function localBox(el: SchemeEl): BBox {
  if (el.type === 'table') {
    const r = tableRadius(el.tableSeats || 0) + 16;
    return { x: -r, y: -r, w: r * 2, h: r * 2 };
  }
  if ((el.type === 'fan' || el.type === 'stage' || el.type === 'unknown') && !el.shape) return { x: 0, y: 0, w: el.w || 200, h: el.h || 80 };
  if (el.shape && el.bb && !(el.rows && el.rows.length)) return el.bb;
  const pts: [number, number][] = seatsOf(el)
    .map((s) => [s.x, s.y] as [number, number])
    .concat(removedSlots(el).map((s) => [s.x, s.y] as [number, number]));
  if (!pts.length) return el.bb || { x: 0, y: 0, w: el.w || 160, h: el.h || 100 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const extraLeft = el.rows && el.rows.length ? 14 : 0; // room for row numbers
  const b = { x: x0 - PAD - extraLeft, y: y0 - PAD - 12, w: x1 - x0 + PAD * 2 + extraLeft * 2, h: y1 - y0 + PAD * 2 + 12 };
  if (el.bb && el.shape) {
    const u = { x: Math.min(b.x, el.bb.x), y: Math.min(b.y, el.bb.y) };
    return { x: u.x, y: u.y, w: Math.max(b.x + b.w, el.bb.x + el.bb.w) - u.x, h: Math.max(b.y + b.h, el.bb.y + el.bb.h) - u.y };
  }
  return b;
}
export function elTransform(el: SchemeEl) {
  const b = localBox(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return `translate(${r1(el.x || 0)} ${r1(el.y || 0)})${el.rot ? ` rotate(${el.rot} ${r1(cx)} ${r1(cy)})` : ''}`;
}
/** Element-local point → plan coordinates. */
export function toScheme(el: SchemeEl, px: number, py: number) {
  const b = localBox(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let x = px;
  let y = py;
  if (el.rot) {
    const a = (el.rot * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * Math.cos(a) - dy * Math.sin(a);
    y = cy + dx * Math.sin(a) + dy * Math.cos(a);
  }
  return { x: x + (el.x || 0), y: y + (el.y || 0) };
}
export function schemeBox(el: SchemeEl): BBox {
  const b = localBox(el);
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => toScheme(el, x, y));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export function fitBox(sc: Scheme, margin = 24): BBox {
  if (!sc.els.length) return { x: 0, y: 0, w: sc.w, h: sc.h };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of sc.els) {
    const b = schemeBox(el);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + margin * 2, h: y1 - y0 + margin * 2 };
}

/** Default stage and screen names follow the interface language; a name the organizer typed is shown as is. */
export function stageName(name: string) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || ['сцена', 'sahna', 'stage'].includes(n)) return t3('Sahna', 'Сцена', 'Stage');
  if (['экран', 'ekran', 'screen'].includes(n)) return t3('Ekran', 'Экран', 'Screen');
  if (['поле', 'maydon', 'field', 'pitch'].includes(n)) return t3('Maydon', 'Поле', 'Field');
  return String(name);
}

// ---------------------------------------------------------------- labels for tickets

export function seatLabel3(el: SchemeEl, row: number | string, n: number): L10n {
  const name = el.name;
  if (el.type === 'table') return tx3(`Stol ${name}, ${n}-joy`, `Стол ${name}, место ${n}`, `Table ${name}, seat ${n}`);
  const isLounge = el.type === 'lounge';
  const sec = isLounge ? tx3('Launj', 'Лаунж', 'Lounge') : tx3('Sektor', 'Сектор', 'Sector');
  // "Партер, ряд 2" reads better than "Сектор Партер"; short codes keep the word ("Сектор A"); a cinema's single "Зал" sector is left out.
  const head = (k: keyof L10n) => {
    if (/^(зал|zal|hall)$/i.test(name)) return '';
    if (isLounge) return /^(лаунж|lounge|launj)$/i.test(name) ? sec[k] : `${sec[k]} ${name}`;
    return name.length <= 3 ? `${sec[k]} ${name}` : name;
  };
  const j = (h: string, rest: string) => (h ? `${h}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));
  return tx3(j(head('uz'), `${row}-qator, ${n}-joy`), j(head('ru'), `ряд ${row}, место ${n}`), j(head('en'), `row ${row}, seat ${n}`));
}
export const tableLabel3 = (el: SchemeEl) => tx3(`Stol ${el.name} toʻliq`, `Стол ${el.name} целиком`, `Whole table ${el.name}`);
export const zoneLabel3 = (el: SchemeEl) => tx3(`${el.name} (tik turish joylari)`, `${el.name} (стоячие места)`, `${el.name} (standing)`);

// ---------------------------------------------------------------- validation

export type SchemeError = { id: string; msg: string };
export function validateScheme(sc: Scheme): SchemeError[] {
  const errs: SchemeError[] = [];
  const names: Record<string, boolean> = {};
  for (const el of sc.els) {
    if (el.type === 'unknown') errs.push({ id: el.id, msg: t3('Aniqlanmadi: turini tanlang yoki oʻchiring', 'Не распознано: выберите вид или удалите', 'Not recognized: choose a kind or delete it') });
    if (SELLABLE.includes(el.type) || el.type === 'stage') {
      const k = el.type === 'table' ? 'table:' + el.name : 'el:' + String(el.name).trim().toLowerCase();
      if (!String(el.name || '').trim()) errs.push({ id: el.id, msg: t3('Nomini kiriting', 'Укажите название', 'Enter a name') });
      else if (names[k])
        errs.push({
          id: el.id,
          msg:
            el.type === 'table'
              ? t3('Bunday raqamli stol bor', 'Стол с таким номером уже есть', 'A table with this number already exists')
              : t3('Bunday nomli sektor bor', 'Сектор с таким названием уже есть', 'A sector with this name already exists'),
        });
      names[k] = true;
    }
    if ((el.type === 'seats' || el.type === 'lounge') && !seatCount(el)) errs.push({ id: el.id, msg: t3('Joy qoʻshing', 'Добавьте места', 'Add seats') });
    if ((el.type === 'seats' || el.type === 'lounge') && el.rows) {
      // duplicate numbers can appear when a row label or numbering is edited by hand
      const seen = new Set<string>();
      for (const s of seatsOf(el)) {
        const k = `${s.row}|${s.n}`;
        if (seen.has(k)) {
          errs.push({ id: el.id, msg: t3('Takroriy joy: {r}-qator, {n}-joy', 'Дубль места: ряд {r}, место {n}', 'Duplicate seat: row {r}, seat {n}', { r: s.row, n: s.n }) });
          break;
        }
        seen.add(k);
      }
    }
    if (el.type === 'fan' && !((el.limit || 0) > 0)) errs.push({ id: el.id, msg: t3('Odamlar limitini kiriting', 'Укажите лимит людей', 'Set the people limit') });
    if (el.type === 'table' && !((el.tableSeats || 0) >= 1 && (el.tableSeats || 0) <= 20)) errs.push({ id: el.id, msg: t3('Joylar sonini kiriting', 'Укажите число мест', 'Set the number of seats') });
    if (el.type === 'table' && !el.mode) errs.push({ id: el.id, msg: t3('Sotish usulini tanlang', 'Выберите способ продажи', 'Choose how it is sold') });
  }
  return errs;
}
export function elStatus(el: SchemeEl, errs: SchemeError[]): { k: 'ok' | 'warn' | 'bad'; label: string } {
  const mine = errs.filter((e) => e.id === el.id);
  if (el.type === 'unknown') return { k: 'bad', label: t3('Tekshiring', 'Проверьте', 'Check') };
  if ((el.type === 'seats' || el.type === 'lounge') && !seatCount(el)) return { k: 'warn', label: t3('Joy qoʻshing', 'Добавьте места', 'Add seats') };
  if (mine.length) return { k: 'warn', label: t3('Tekshiring', 'Проверьте', 'Check') };
  if (el.src === 'svg') return { k: 'ok', label: t3('Aniqlandi', 'Распознан', 'Recognized') };
  return { k: 'ok', label: t3('Tayyor', 'Готов', 'Ready') };
}

// ---------------------------------------------------------------- manual elements

function below(sc: Scheme) {
  const fb = sc.els.length ? fitBox(sc, 0) : { x: 0, y: 0, w: 0, h: 60 };
  return fb.y + fb.h + 40;
}
export function newSector(sc: Scheme, type: 'seats' | 'lounge' = 'seats', opts: Partial<SchemeEl> = {}): SchemeEl {
  const n = sc.els.filter((e) => e.type === type).length + 1;
  const name = type === 'lounge' ? (n > 1 ? `Launj ${n}` : 'Launj') : alpha(sc.els.filter((e) => e.type === 'seats').length);
  return {
    id: uid('el'),
    type,
    name,
    x: 60,
    y: Math.max(40, below(sc)),
    rot: 0,
    cat: type === 'lounge' && sc.cats.some((c) => c.id === 'lounge') ? 'lounge' : 'std',
    rowStart: 1,
    rowLabels: 'num',
    numbering: 'ltr',
    align: 'center',
    curve: 0,
    rows: Array(type === 'lounge' ? 3 : 6).fill(type === 'lounge' ? 8 : 12),
    removed: [],
    seatCat: {},
    src: 'manual',
    rev: 1,
    ...opts,
  };
}
export function newFan(sc: Scheme): SchemeEl {
  return { id: uid('el'), type: 'fan', name: t3('Fan-zona', 'Фан-зона', 'Fan zone'), x: 80, y: Math.max(40, below(sc)), w: 260, h: 110, rot: 0, limit: null, cat: 'std', src: 'manual', rev: 1 };
}
export function newTable(sc: Scheme): SchemeEl {
  const nums = sc.els.filter((e) => e.type === 'table').map((e) => parseInt(e.name, 10) || 0);
  return {
    id: uid('el'),
    type: 'table',
    name: String((nums.length ? Math.max(...nums) : 0) + 1),
    x: 120,
    y: Math.max(80, below(sc) + 20),
    rot: 0,
    tableSeats: 6,
    mode: 'both',
    cat: 'std',
    src: 'manual',
    rev: 1,
  };
}
export function newStage(name?: string): SchemeEl {
  return { id: uid('el'), type: 'stage', name: name || t3('Sahna', 'Сцена', 'Stage'), x: 300, y: 20, w: 400, h: 56, rot: 0, src: 'manual', rev: 1 };
}

// ---------------------------------------------------------------- hall templates

/** Ready-made hall layouts the organizer can start from: the hardest part of the job is getting seats right. */
export type HallTemplate = 'cinema' | 'theatre' | 'concert' | 'stadium' | 'banquet' | 'ga' | `arena-${ArenaLayout}`;
export function templateScheme(kind: HallTemplate): Scheme {
  if (kind.startsWith('arena-')) return arenaScheme(kind.slice(6) as ArenaLayout);
  const sc: Scheme = { w: 1000, h: 700, cats: defaultCats(), els: [] };
  const grid = (name: string, cx: number, y: number, rows: number[], extra: Partial<SchemeEl> = {}): SchemeEl => {
    const g = extra.seatGap || SEAT_GAP;
    const w = (Math.max(...rows) - 1) * g;
    const el = newSector(sc, 'seats', { name, rows, ...extra });
    el.x = Math.round(cx - w / 2);
    el.y = y;
    return el;
  };
  if (kind === 'cinema') {
    sc.els.push({ ...newStage('Ekran'), x: 260, y: 20, w: 480, h: 18 });
    const z = grid('Zal', 500, 100, Array(12).fill(18), { curve: 18 });
    for (let n = 1; n <= 18; n++) {
      z.seatCat![`11|${n}`] = 'vip';
      z.seatCat![`12|${n}`] = 'vip';
    }
    sc.els.push(z);
  } else if (kind === 'theatre') {
    sc.els.push({ ...newStage('Sahna'), x: 300, y: 20, w: 400, h: 56 });
    const p = grid('Parter', 500, 120, [16, 18, 18, 20, 20, 22, 22, 22, 24, 24, 24, 24], { curve: 24, numbering: 'ltr' });
    for (let r = 1; r <= 3; r++) for (let n = 1; n <= 20; n++) p.seatCat![`${r}|${n}`] = 'vip';
    sc.els.push(p, grid('Amfiteatr', 500, 430, Array(6).fill(28), { curve: 30 }), grid('Balkon', 500, 610, Array(4).fill(32), { curve: 34, rowLabels: 'alpha' }));
  } else if (kind === 'concert') {
    sc.els.push({ ...newStage(), x: 340, y: 20, w: 320, h: 56 });
    sc.els.push({ ...newFan(sc), name: 'Fan-zona', x: 330, y: 100, w: 340, h: 120, limit: 500 });
    sc.els.push(grid('VIP', 500, 262, Array(4).fill(16), { cat: 'vip' }));
    sc.els.push(grid('A', 180, 380, Array(10).fill(14), { rot: -12 }), grid('B', 500, 372, Array(10).fill(18)), grid('C', 820, 380, Array(10).fill(14), { rot: 12 }));
  } else if (kind === 'stadium') {
    // field in the middle, four stands 30 units away from it, VIP box behind the main stand
    sc.els.push({ ...newStage('Maydon'), x: 300, y: 260, w: 400, h: 220 });
    sc.els.push(grid('Gʻarbiy', 500, 56, Array(10).fill(30), { numbering: 'rtl' }));
    sc.els.push(grid('Sharqiy', 500, 534, Array(10).fill(30)));
    sc.els.push(grid('Shimoliy', 189, 313, Array(8).fill(12), { rot: -90 }));
    sc.els.push(grid('Janubiy', 811, 313, Array(8).fill(12), { rot: 90 }));
    sc.els.push(grid('VIP lojasi', 500, 752, Array(2).fill(12), { cat: 'vip' }));
  } else if (kind === 'banquet') {
    sc.els.push({ ...newStage(), x: 350, y: 20, w: 300, h: 50 });
    const positions = [
      [180, 160],
      [340, 160],
      [660, 160],
      [820, 160],
      [180, 320],
      [340, 320],
      [500, 320],
      [660, 320],
      [820, 320],
      [260, 480],
      [420, 480],
      [580, 480],
      [740, 480],
    ];
    positions.forEach(([x, y], i) => sc.els.push({ ...newTable(sc), name: String(i + 1), x, y, tableSeats: i < 4 ? 8 : 6, mode: 'both' }));
  } else {
    sc.els.push({ ...newStage(), x: 300, y: 20, w: 400, h: 56 });
    sc.els.push({ ...newFan(sc), name: 'Kirish (erkin joylashuv)', x: 200, y: 110, w: 600, h: 300, limit: 1000 });
  }
  return sc;
}

// ---------------------------------------------------------------- SVG import

const SHAPE_TAGS = ['path', 'rect', 'polygon', 'polyline', 'ellipse', 'circle', 'line'];
const GEO_ATTRS: Record<string, string[]> = {
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  polygon: ['points'],
  polyline: ['points'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  line: ['x1', 'y1', 'x2', 'y2'],
};
const KIND_MAP: Record<string, ElType> = {
  sector: 'seats',
  seats: 'seats',
  vip: 'seats',
  lounge: 'lounge',
  fan: 'fan',
  fanzone: 'fan',
  'fan-zone': 'fan',
  dancefloor: 'fan',
  table: 'table',
  stage: 'stage',
  screen: 'stage',
  scene: 'stage',
};
function kindOf(node: Element): string | null {
  const d = (node.getAttribute('data-sayohat') || node.getAttribute('data-kind') || '').toLowerCase().trim();
  if (d && KIND_MAP[d]) return d;
  const id = (node.getAttribute('id') || '').toLowerCase();
  const m = id.match(/^(sector|vip|lounge|fan|fanzone|dancefloor|table|stage|screen|scene)(?:[-_:](.*))?$/);
  if (m) return m[1];
  // iticket-style markup: <g data-sector="123"> with seats inside, or data-is_ga for general admission
  if (node.nodeName.toLowerCase() === 'g' && node.hasAttribute('data-sector') && !node.hasAttribute('data-row')) {
    if (node.getAttribute('data-is_ga') === '1') return 'fan';
    if (node.querySelector('[data-seat],.seat')) return 'sector';
  }
  return null;
}
export class SvgImportError extends Error {}

const isSeatNode = (n: Element) =>
  n.hasAttribute('data-seat') || (n.hasAttribute('data-row') && n.nodeName.toLowerCase() !== 'g') || /\bseat\b/.test(n.getAttribute('class') || '') || /^seat[-_]/i.test(n.getAttribute('id') || '');

/**
 * Numbers seats that have no row/seat marks: groups them into rows by their vertical position, then numbers
 * each row left to right. Lets the platform recognise plain drawings where seats are just circles.
 */
export function autoNumber(points: { x: number; y: number }[]): RawSeat[] {
  if (!points.length) return [];
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((d) => d > 0.5);
  const med = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 10;
  const tol = Math.max(2, med * 0.5);
  const sorted = points.slice().sort((a, b) => a.y - b.y);
  const rows: { y: number; pts: { x: number; y: number }[] }[] = [];
  for (const p of sorted) {
    const row = rows.find((r) => Math.abs(r.y - p.y) <= tol);
    if (row) {
      row.pts.push(p);
      row.y = (row.y * (row.pts.length - 1) + p.y) / row.pts.length;
    } else rows.push({ y: p.y, pts: [p] });
  }
  rows.sort((a, b) => a.y - b.y);
  const out: RawSeat[] = [];
  rows.forEach((r, i) => r.pts.sort((a, b) => a.x - b.x).forEach((p, j) => out.push({ r: i + 1, n: j + 1, x: r1(p.x), y: r1(p.y) })));
  return out;
}

/** Parses an SVG file (Sayohat markup, iticket-style data-sector/data-row/data-seat, or plain circles) into a plan. Needs the DOM. */
export function importSvg(text: string): Scheme {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch {
    throw new SvgImportError('bad');
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new SvgImportError('bad');
  root.querySelectorAll('script,foreignObject,iframe,style,image,use,a').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (/^on|^style$|href$/i.test(a.name)) n.removeAttribute(a.name);
    });
  });
  const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const W = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(root.getAttribute('width') || '') || 1000;
  const H = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(root.getAttribute('height') || '') || 700;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:1000px;visibility:hidden;pointer-events:none';
  const live = document.importNode(root, true) as unknown as SVGSVGElement;
  live.setAttribute('width', String(W));
  live.setAttribute('height', String(H));
  if (!live.getAttribute('viewBox')) live.setAttribute('viewBox', `0 0 ${W} ${H}`);
  host.appendChild(live);
  document.body.appendChild(host);
  try {
    const ctm = live.getScreenCTM();
    if (!ctm) throw new SvgImportError('bad');
    const rootInv = ctm.inverse();
    const toRoot = (node: SVGGraphicsElement) => rootInv.multiply(node.getScreenCTM() || ctm);
    const pt = (m: DOMMatrix, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
    const boxOf = (node: Element): BBox => {
      const g = node as SVGGraphicsElement;
      const b = g.getBBox();
      const m = toRoot(g);
      const ps = [pt(m, b.x, b.y), pt(m, b.x + b.width, b.y), pt(m, b.x, b.y + b.height), pt(m, b.x + b.width, b.y + b.height)];
      const xs = ps.map((p) => p.x);
      const ys = ps.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const shapeOf = (node: Element): Shape | undefined => {
      const tag = node.nodeName.toLowerCase();
      if (!GEO_ATTRS[tag]) return undefined;
      const a: Record<string, string> = {};
      for (const k of GEO_ATTRS[tag]) {
        const v = node.getAttribute(k);
        if (v != null) a[k] = v;
      }
      const m = toRoot(node as SVGGraphicsElement);
      return { tag, a, m: [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.round(v * 1000) / 1000) };
    };
    const hasMarked = (n: Element) => [...n.querySelectorAll('*')].some((c) => kindOf(c));
    const visible = (n: Element) => SHAPE_TAGS.includes(n.nodeName.toLowerCase()) || (n.nodeName.toLowerCase() === 'g' && !!n.querySelector(SHAPE_TAGS.join(',')));
    const SKIP = ['defs', 'title', 'desc', 'metadata', 'text', 'tspan', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern', 'symbol', 'marker'];
    const cands: { node: Element; kind: string | null }[] = [];
    const walk = (node: Element) => {
      for (const ch of [...node.children]) {
        const tag = ch.nodeName.toLowerCase();
        if (SKIP.includes(tag)) continue;
        const k = kindOf(ch);
        if (k) cands.push({ node: ch, kind: k });
        else if (tag === 'g' && hasMarked(ch)) walk(ch);
        else if (visible(ch)) {
          // An unmarked group made of many small round shapes is most likely a block of seats.
          const rounds = tag === 'g' ? ch.querySelectorAll('circle,ellipse') : [];
          cands.push({ node: ch, kind: rounds.length >= 6 ? 'sector' : null });
        }
      }
    };
    walk(live);
    const sc: Scheme = { w: Math.round(W), h: Math.round(H), cats: defaultCats(), els: [] };
    let auto = 0;
    let seatIdx = 0;
    for (const c of cands) {
      const n = c.node;
      const type: ElType = c.kind ? KIND_MAP[c.kind] : 'unknown';
      const isSeatInside = (s: Element) => isSeatNode(s) || (!n.querySelector('[data-seat],.seat') && type === 'seats' && ['circle', 'ellipse'].includes(s.nodeName.toLowerCase()));
      const outline = SHAPE_TAGS.includes(n.nodeName.toLowerCase()) ? n : [...n.querySelectorAll(SHAPE_TAGS.join(','))].find((s) => !isSeatInside(s) && !isSeatNode(s.parentElement as Element));
      const box = boxOf(n);
      const rawName =
        n.getAttribute('data-name') ||
        n.getAttribute('aria-label') ||
        (n.getAttribute('id') || '').replace(/^(sector|vip|lounge|fan|fanzone|dancefloor|table|stage|screen|scene)[-_:]?/i, '');
      const el: SchemeEl = { id: uid('el'), type, name: rawName || '', x: 0, y: 0, rot: 0, src: 'svg', rev: 1, notes: [] };
      const ds = n.getAttribute('data-sector');
      if (ds) el.extId = ds;
      if (type === 'table') {
        const seatNodes = [...n.querySelectorAll('*')].filter(isSeatNode);
        el.tableSeats = clamp(parseInt(n.getAttribute('data-seats') || '', 10) || seatNodes.length || 4, 1, 20);
        const mode = n.getAttribute('data-mode');
        el.mode = mode === 'whole' || mode === 'seats' || mode === 'both' ? mode : 'both';
        el.cat = 'std';
        const ob = outline ? boxOf(outline) : box;
        el.x = Math.round(ob.x + ob.w / 2);
        el.y = Math.round(ob.y + ob.h / 2);
        el.name = el.name || String(++auto);
      } else {
        if (outline && outline !== n) {
          el.shape = shapeOf(outline);
          el.bb = boxOf(outline);
        } else if (outline) {
          el.shape = shapeOf(outline);
          el.bb = box;
        } else el.bb = box;
        if (!el.shape) el.shape = { tag: 'rect', a: { x: box.x, y: box.y, width: box.w, height: box.h, rx: 8 }, m: [1, 0, 0, 1, 0, 0] };
        if (type === 'seats' || type === 'lounge') {
          el.cat = c.kind === 'vip' || (n.getAttribute('data-category') || '').toLowerCase() === 'vip' ? 'vip' : 'std';
          const seatNodes = [...n.querySelectorAll('*')].filter((s) => s !== outline && isSeatInside(s));
          // a seat drawn as <g class="seat"><circle/><text/></g>: take the group, skip its inner shapes
          const tops = seatNodes.filter((s) => !seatNodes.some((p) => p !== s && p.contains(s)));
          const numbered = tops.filter((s) => s.getAttribute('data-row') && s.getAttribute('data-seat'));
          const seen = new Set<string>();
          el.pts = [];
          const widths = tops.slice(0, 200).map((t) => boxOf(t).w).filter((w) => w > 0).sort((a, b) => a - b);
          if (widths.length) el.seatR = clamp(r1(widths[Math.floor(widths.length / 2)] / 2), 2, 60);
          for (const s of numbered) {
            const r = (s.getAttribute('data-row') || '').trim();
            const num = parseInt(s.getAttribute('data-seat') || '', 10);
            const b = boxOf(s);
            const rr: number | string = /^\d+$/.test(r) ? parseInt(r, 10) : r;
            if (seen.has(rr + '|' + num)) {
              el.notes!.push(t3('Takroriy joy: {r}-qator, {n}-joy', 'Дубль места: ряд {r}, место {n}', 'Duplicate seat: row {r}, seat {n}', { r: rr, n: num }));
              continue;
            }
            seen.add(rr + '|' + num);
            el.pts.push({ r: rr, n: num, x: r1(b.x + b.w / 2), y: r1(b.y + b.h / 2) });
          }
          const unnumbered = tops.filter((s) => !(s.getAttribute('data-row') && s.getAttribute('data-seat')));
          if (unnumbered.length && !numbered.length) {
            el.pts = autoNumber(unnumbered.map((s) => {
              const b = boxOf(s);
              return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
            }));
            el.notes!.push(t3('{n} ta joy avtomatik raqamlandi — tekshiring', '{n} мест пронумерованы автоматически — проверьте', '{n} seats were numbered automatically — please check', { n: unnumbered.length }));
          } else if (unnumbered.length) {
            el.notes!.push(t3('{n} ta joyda qator yoki joy raqami yoʻq', '{n} мест без номера ряда или места', '{n} seats have no row or seat number', { n: unnumbered.length }));
          }
          if (el.pts.length > 1) {
            // seat size must not exceed the gap to the nearest neighbour, whatever the drawing put in the seat group
            const sample = el.pts.slice(0, 300);
            const nn = sample.map((a) => Math.min(...sample.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))).filter((d) => d > 0).sort((a, b) => a - b);
            const gap = nn[Math.floor(nn.length / 2)];
            if (gap) el.seatR = clamp(r1(Math.min(el.seatR || gap, gap * 0.42)), 2, 60);
          }
          el.removed = [];
          el.seatCat = {};
          if (!el.name) el.name = type === 'lounge' ? 'Launj' : alpha(seatIdx++ % 26);
        } else if (type === 'fan') {
          const lim = parseInt(n.getAttribute('data-limit') || '', 10);
          el.limit = lim > 0 ? lim : null;
          el.cat = 'std';
          if (!el.name) el.name = t3('Fan-zona', 'Фан-зона', 'Fan zone');
        } else if (type === 'stage') {
          if (!el.name) el.name = c.kind === 'screen' ? t3('Ekran', 'Экран', 'Screen') : t3('Sahna', 'Сцена', 'Stage');
        } else {
          el.name = n.getAttribute('id') || n.nodeName.toLowerCase();
        }
      }
      sc.els.push(el);
    }
    if (sc.els.some((e) => e.type === 'lounge') && !sc.cats.some((c) => c.id === 'lounge')) {
      sc.cats.push({ id: 'lounge', name: tx3('Launj', 'Лаунж', 'Lounge'), color: CAT_PALETTE[2] });
      sc.els.filter((e) => e.type === 'lounge').forEach((e) => {
        e.cat = 'lounge';
      });
    }
    return sc;
  } finally {
    host.remove();
  }
}

/** Turns an element with no usable seats into a manual grid placed over its outline. */
export function gridInside(el: SchemeEl, rows: number, perRow: number) {
  const b = el.bb || localBox(el);
  el.rows = Array(rows).fill(perRow);
  el.rowStart = 1;
  el.numbering = 'ltr';
  el.rowLabels = 'num';
  el.align = 'center';
  el.pts = undefined;
  el.removed = [];
  el.seatCat = {};
  const w = (perRow - 1) * SEAT_GAP;
  const h = (rows - 1) * ROW_GAP;
  el.x = Math.round(b.x + b.w / 2 - w / 2);
  el.y = Math.round(b.y + b.h / 2 - h / 2 + 6);
  el.gridFromSvg = true;
  if (el.shape) {
    const m = el.shape.m.slice();
    m[4] -= el.x;
    m[5] -= el.y;
    el.shape.m = m;
    el.bb = { x: b.x - el.x, y: b.y - el.y, w: b.w, h: b.h };
  }
  touch(el);
}

/** Sample SVG in the Sayohat markup, offered next to the upload button (US-06). */
export function sampleSvg(withProblems = false) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ${withProblems ? 700 : 660}" width="1000" height="${withProblems ? 700 : 660}">`,
    '<!-- Sayohat scheme markup. Mark every element with data-sayohat: stage | sector | vip | lounge | fan | table. -->',
    '<!-- Seats: <circle data-row="1" data-seat="1" .../> inside a sector. Fan zone: data-limit. Table: data-seats and data-mode (whole | seats | both). -->',
    '<g data-sayohat="stage" data-name="Sahna"><rect x="340" y="24" width="320" height="56" rx="8" fill="#333"/></g>',
    '<g data-sayohat="fan" data-name="Fan-zona" data-limit="500"><rect x="330" y="104" width="340" height="116" rx="16" fill="#e6f2ef" stroke="#1FA187"/></g>',
  ];
  [
    [150, 130],
    [230, 160],
    [150, 205],
    [850, 130],
    [770, 160],
    [850, 205],
  ].forEach(([x, y], i) => parts.push(`<g data-sayohat="table" data-name="${i + 1}" data-seats="6" data-mode="${i < 2 ? 'whole' : i < 4 ? 'both' : 'seats'}"><circle cx="${x}" cy="${y}" r="24" fill="#f3e9d2" stroke="#C2662D"/></g>`));
  const sector = (kind: string, name: string, x: number, y: number, rows: number, seats: number, extra = '') => {
    const w = (seats - 1) * SEAT_GAP;
    const h = (rows - 1) * ROW_GAP;
    parts.push(`<g data-sayohat="${kind}" data-name="${name}"${extra}><rect x="${x - PAD}" y="${y - PAD - 12}" width="${w + PAD * 2}" height="${h + PAD * 2 + 12}" rx="10" fill="none" stroke="#999"/>`);
    for (let r = 1; r <= rows; r++) for (let n = 1; n <= seats; n++) parts.push(`<circle data-row="${r}" data-seat="${n}" cx="${x + (n - 1) * SEAT_GAP}" cy="${y + (r - 1) * ROW_GAP}" r="5" fill="#bbb"/>`);
    parts.push('</g>');
  };
  sector('vip', 'VIP', 388, 262, 4, 16, ' data-category="vip"');
  sector('sector', 'A', 96, 372, 10, 14);
  sector('sector', 'B', 364, 372, 10, 18);
  sector('sector', 'C', 696, 372, 10, 14);
  sector('lounge', 'Launj', 428, 588, 3, 10);
  if (withProblems) {
    parts.push('<g data-sayohat="sector" data-name="D"><path d="M70 600 L330 600 L330 680 L70 680 Z" fill="none" stroke="#999"/></g>');
    parts.push('<rect id="bar" x="700" y="604" width="220" height="70" rx="8" fill="#ddd"/>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}

/** A category name for display. */
export const catName = (c: SeatCat) => tl(c.name);
