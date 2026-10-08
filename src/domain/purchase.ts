/*
 * Purchase helpers shared by the storefront and the box office: the buyer's selection (before a hold exists),
 * turning it into hold items with fixed prices, live pruning, passport checks (mock state service),
 * the mock payment gateway and what this browser remembers (last buyer, own orders).
 */
import { t3, tl, tx3, type L10n } from '../lib/i18n';
import { safeLS, sumBy } from '../lib/util';
import { getDb, tx } from '../store/db';
import { holdAlive, itemCount, MAX_PER_ORDER, occupancy, parseSid, priceFor, pricingOf, tablePrice, visibleTypes, type Unit } from './rules';
import { catOf, seatLabel3, seatsOf, tableLabel3, zoneLabel3 } from './scheme';
import type { Buyer, EventItem, Hold, HoldItem, Order, PassportRule, Scheme, SchemeEl } from './types';

// ---------------------------------------------------------------- selection (before the hold)

export type SelItem = { k: 'seat'; key: string; elId: string; typeId: string | null } | { k: 'table'; elId: string } | { k: 'zone'; elId: string; qty: number };
/** What the buyer or cashier picked on a plan or for a museum slot. `types`: museum ticket type id → quantity. */
export type Sel = { items: SelItem[]; types: Record<string, number>; focus: string | null };
export const emptySel = (): Sel => ({ items: [], types: {}, focus: null });

const elOf = (u: Unit, id: string) => u.scheme?.els.find((e) => e.id === id);

/** Number of tickets in a selection: a whole table counts as its seats (US-28). */
export function selCount(u: Unit, s: Sel): number {
  let n = sumBy(Object.values(s.types || {}), (q) => q);
  for (const it of s.items) {
    if (it.k === 'seat') n += 1;
    else if (it.k === 'zone') n += it.qty;
    else {
      const el = elOf(u, it.elId);
      n += el ? seatsOf(el).length : 0;
    }
  }
  return n;
}

export const slotLabel3 = (u: Unit): L10n => tx3(`Slot ${u.start}–${u.end}`, `Слот ${u.start}–${u.end}`, `Slot ${u.start}–${u.end}`);
const usesTypes = (ev: EventItem) => pricingOf(ev.kind) === 'types';

/** Price of one seat for a ticket type, the way the hold will fix it. */
export function seatPrice(ev: EventItem, el: SchemeEl, cat: string, typeId: string | null, row?: number | string): number {
  if (el.type === 'table' && !usesTypes(ev)) return tablePrice(ev, el, false) || 0;
  return priceFor(ev, el, cat, typeId, row) || 0;
}
export function zonePrice(ev: EventItem, el: SchemeEl): number {
  return (pricingOf(ev.kind) === 'element' ? ev.prices.els[el.id] : priceFor(ev, el, el.cat || 'std')) || 0;
}

/** Expands the selection into hold items with prices and labels (the price is fixed at this moment). */
export function buildItems(u: Unit, s: Sel): HoldItem[] {
  const ev = u.ev;
  if (u.museum) {
    return visibleTypes(ev)
      .filter((t) => (s.types[t.id] || 0) > 0)
      .map((t) => ({ k: 'slot' as const, typeId: t.id, qty: s.types[t.id], price: t.price || 0, label: slotLabel3(u) }));
  }
  const out: HoldItem[] = [];
  const firstType = visibleTypes(ev)[0]?.id || null;
  for (const it of s.items) {
    const el = elOf(u, it.elId);
    if (!el) continue;
    if (it.k === 'seat') {
      const st = seatsOf(el).find((x) => x.key === it.key);
      if (!st) continue;
      const typeId = usesTypes(ev) ? it.typeId || firstType : null;
      out.push({ k: 'seat', key: it.key, elId: el.id, cat: st.cat, typeId, price: seatPrice(ev, el, st.cat, typeId, st.row), label: seatLabel3(el, st.row, st.n) });
    } else if (it.k === 'table') {
      const ss = seatsOf(el);
      out.push({ k: 'table', elId: el.id, seats: ss.map((x) => x.key), seatLabels: ss.map((x) => seatLabel3(el, x.row, x.n)), price: tablePrice(ev, el, true) || 0, label: tableLabel3(el) });
    } else {
      out.push({ k: 'zone', elId: el.id, qty: it.qty, price: zonePrice(ev, el), label: zoneLabel3(el) });
    }
  }
  return out;
}

/** Removes from the selection what is no longer available (sold or held by someone else). */
export function pruneSel(u: Unit, s: Sel, exceptHoldId: string | null): { sel: Sel; gone: string[] } {
  if (u.museum || !u.scheme) return { sel: s, gone: [] };
  const occ = occupancy(u.sid, exceptHoldId);
  const gone: string[] = [];
  let changed = false;
  const items: SelItem[] = [];
  for (const it of s.items) {
    const el = elOf(u, it.elId);
    if (!el) {
      changed = true;
      continue;
    }
    if (it.k === 'seat') {
      const st = seatsOf(el).find((x) => x.key === it.key);
      if (!st || occ.seats.has(it.key) || (el.type === 'table' && occ.wholeTables.has(el.id))) {
        changed = true;
        if (st) gone.push(tl(seatLabel3(el, st.row, st.n)));
        continue;
      }
    } else if (it.k === 'table') {
      if (occ.wholeTables.has(el.id) || seatsOf(el).some((x) => occ.seats.has(x.key))) {
        changed = true;
        gone.push(tl(tableLabel3(el)));
        continue;
      }
    } else {
      const left = (el.limit || 0) - (occ.zones[el.id] || 0);
      if (left <= 0) {
        changed = true;
        gone.push(tl(zoneLabel3(el)));
        continue;
      }
      if (it.qty > left) {
        changed = true;
        items.push({ ...it, qty: left });
        continue;
      }
    }
    items.push(it);
  }
  return { sel: changed ? { ...s, items } : s, gone };
}

/** Seat keys to draw as "mine": single seats and every seat of a whole table. */
export function selectedKeys(u: Unit, s: Sel): Set<string> {
  const out = new Set<string>();
  for (const it of s.items) {
    if (it.k === 'seat') out.add(it.key);
    else if (it.k === 'table') {
      const el = elOf(u, it.elId);
      if (el) for (const x of seatsOf(el)) out.add(x.key);
    }
  }
  return out;
}

/** Price shown on the plan for an element / category: the element price, or the lowest ticket type price. */
export function planPrice(ev: EventItem) {
  return (el: SchemeEl, cat: string, row?: number | string): number | null => {
    if (!usesTypes(ev)) {
      if (el.type === 'table') return el.mode === 'whole' ? tablePrice(ev, el, true) : tablePrice(ev, el, false);
      return priceFor(ev, el, cat, null, row);
    }
    const c = el.type === 'table' || el.type === 'fan' ? el.cat || 'std' : cat;
    const ps = visibleTypes(ev)
      .map((t) => (t.prices || {})[c])
      .filter((p): p is number => !!p && p > 0);
    return ps.length ? Math.min(...ps) : null;
  };
}
/** Legend text for a seat category (theatre, cinema): "150 000 soʻm" or "from 100 000 soʻm". */
const PRICE_PALETTE = ['#d64545', '#2f8f46', '#2e6fd1', '#9b5de5', '#e08a1b', '#1fa1a1', '#c2662d', '#5b6b8c', '#d4a017', '#e05780'];
/**
 * Seats coloured by price, the way iticket shows them: one colour per price level, legend with prices.
 * Only for events priced by sector/row; null when the whole plan has one price (category colours are clearer then).
 */
export function priceColors(ev: EventItem, sc: Scheme | null | undefined) {
  if (!sc || usesTypes(ev) || pricingOf(ev.kind) !== 'element') return null;
  const levels = new Set<number>();
  for (const el of sc.els) {
    if (el.type !== 'seats' && el.type !== 'lounge') continue;
    for (const st of seatsOf(el)) {
      const pr = priceFor(ev, el, st.cat, null, st.row);
      if (pr) levels.add(pr);
    }
  }
  if (levels.size < 2) return null;
  const sorted = [...levels].sort((a, b) => b - a);
  const color = new Map(sorted.map((pr, i) => [pr, PRICE_PALETTE[i % PRICE_PALETTE.length]]));
  return {
    legend: sorted.map((price) => ({ price, color: color.get(price)! })),
    seatColor: (el: SchemeEl, st: { cat: string; row: number | string }) => (el.type === 'table' ? null : color.get(priceFor(ev, el, st.cat, null, st.row) || 0) || null),
  };
}
export function catPriceRange(ev: EventItem, catId: string): { min: number; many: boolean } | null {
  if (!usesTypes(ev)) return null;
  const ps = [...new Set(visibleTypes(ev).map((t) => (t.prices || {})[catId]).filter((p): p is number => !!p && p > 0))];
  return ps.length ? { min: Math.min(...ps), many: ps.length > 1 } : null;
}
export const catName = (u: Unit, catId: string) => (u.scheme ? tl(catOf(u.scheme, catId).name) : '');

export const limitText = () => t3('Bir xaridda {n} tadan ortiq chipta boʻlmaydi', 'Не больше {n} билетов в одной покупке', 'No more than {n} tickets per purchase', { n: MAX_PER_ORDER });

// ---------------------------------------------------------------- holds

/** The active hold of a holder for a unit, so the holder's own places are not shown as taken. */
export function heldBy(holder: string, sid: string): Hold | null {
  return getDb().holds.find((h) => h.holder === holder && h.sid === sid && holdAlive(h)) || null;
}
export const holdCount = (h: Hold) => itemCount(h.items);

// ---------------------------------------------------------------- museum visitors and passports (US-32)

export type VisitorSlot = { typeId: string; passport: PassportRule; typeName: L10n };
/** One entry per ticket of the hold, in the order completeOrder() hands visitors to tickets. */
export function visitorSlots(h: Hold, ev: EventItem): VisitorSlot[] {
  const out: VisitorSlot[] = [];
  for (const it of h.items) {
    if (it.k !== 'slot') continue;
    const t = ev.types.find((x) => x.id === it.typeId);
    for (let i = 0; i < it.qty; i++) out.push({ typeId: it.typeId, passport: t?.passport || 'none', typeName: t?.name || it.label });
  }
  return out;
}
export const needsVisitors = (h: Hold, ev: EventItem) => visitorSlots(h, ev).some((v) => v.passport !== 'none');

export const PASS_RE = /^[A-Z]{2}\d{7}$/;
export const normDoc = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '');
export type PassportStatus = 'idle' | 'checking' | 'ok' | 'bad' | 'down' | 'format' | 'dup';
/**
 * Mock of the state passport service: a passport or ID card is "found" when it is two Latin letters and seven
 * digits and the number does not end in 0. When the service is switched off in the demo tools it is "down".
 */
export function passportCheck(doc: string): 'ok' | 'bad' | 'down' | 'format' {
  const d = normDoc(doc);
  if (!PASS_RE.test(d)) return 'format';
  if (!getDb().demo.passportUp) return 'down';
  return d.endsWith('0') ? 'bad' : 'ok';
}
/** One passport — one ticket per slot (US-32, rule 4). */
export function passportUsed(sid: string, doc: string): boolean {
  const d = normDoc(doc);
  return getDb().tickets.some((t) => t.sid === sid && t.v?.citizen && normDoc(t.v.doc) === d);
}
/** Moves one ticket of a hold from one type to another (citizen → foreigner rate after a failed check). */
export function switchSlotType(holdId: string, fromTypeId: string, toTypeId: string): boolean {
  return tx((d) => {
    const h = d.holds.find((x) => x.id === holdId);
    const p = h ? parseSid(h.sid) : null;
    const ev = p && p.museum ? d.events.find((e) => e.id === p.evId) : null;
    const to = ev?.types.find((t) => t.id === toTypeId);
    if (!h || !to) return false;
    const src = h.items.find((it) => it.k === 'slot' && it.typeId === fromTypeId);
    if (!src || src.k !== 'slot') return false;
    src.qty -= 1;
    if (src.qty <= 0) h.items = h.items.filter((it) => it !== src);
    const dst = h.items.find((it) => it.k === 'slot' && it.typeId === toTypeId);
    if (dst && dst.k === 'slot') dst.qty += 1;
    else h.items.push({ k: 'slot', typeId: toTypeId, qty: 1, price: to.price || 0, label: src.label });
    return true;
  });
}

// ---------------------------------------------------------------- mock payment gateway (US-33)

export const CARD_METHODS = ['humo', 'uzcard', 'visa', 'mastercard'] as const;
export const isCard = (m: string) => (CARD_METHODS as readonly string[]).includes(m);
export type PayFail = 'funds' | 'declined' | 'cancel';
/** Test cards: …0002 — insufficient funds, …0003 — declined by the bank; anything else is paid. */
export function cardOutcome(num: string): 'ok' | Exclude<PayFail, 'cancel'> {
  const d = num.replace(/\D/g, '');
  if (d.endsWith('0002')) return 'funds';
  if (d.endsWith('0003')) return 'declined';
  return 'ok';
}
export const payFailText = (r: PayFail) =>
  ({
    funds: t3('Mablagʻ yetarli emas', 'Недостаточно средств', 'Insufficient funds'),
    declined: t3('Bank toʻlovni rad etdi', 'Банк отклонил оплату', 'The bank declined the payment'),
    cancel: t3('Toʻlov bekor qilindi', 'Оплата отменена', 'Payment cancelled'),
  })[r];

// ---------------------------------------------------------------- what this browser remembers

const LAST_BUYER = 'sayohat-last-buyer';
const MY_ORDERS = 'sayohat-my-orders';
const UNLOCKED = 'sayohat-unlocked';

export function lastBuyer(): Buyer | null {
  try {
    const b = JSON.parse(safeLS('get', LAST_BUYER) || 'null');
    return b && typeof b.phone === 'string' ? (b as Buyer) : null;
  } catch {
    return null;
  }
}
export const saveLastBuyer = (b: Buyer) => safeLS('set', LAST_BUYER, JSON.stringify(b));
export const forgetLastBuyer = () => safeLS('del', LAST_BUYER);

function readList(key: string, session = false): string[] {
  try {
    const raw = session ? sessionStorage.getItem(key) : safeLS('get', key);
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export const myOrderIds = () => readList(MY_ORDERS);
export function rememberOrder(id: string) {
  const l = myOrderIds().filter((x) => x !== id);
  l.unshift(id);
  safeLS('set', MY_ORDERS, JSON.stringify(l.slice(0, 50)));
}
/** Opened through "Find ticket" (phone + order number) in this browser session. */
export function unlockOrder(id: string) {
  const l = readList(UNLOCKED, true);
  if (!l.includes(id)) l.push(id);
  try {
    sessionStorage.setItem(UNLOCKED, JSON.stringify(l));
  } catch {
    /* storage blocked */
  }
}
export function canSeeOrder(o: Order, buyerId: string | null): boolean {
  if (myOrderIds().includes(o.id) || readList(UNLOCKED, true).includes(o.id)) return true;
  const acc = buyerId ? getDb().buyers.find((b) => b.id === buyerId) : null;
  return !!acc && acc.phone === o.buyer.phone;
}

// ---------------------------------------------------------------- box office settings (per browser)

export type PrintFmt = '80mm' | 'A4';
const PRINT_FMT = 'sayohat-box-print';
export const printFmt = (): PrintFmt => (safeLS('get', PRINT_FMT) === 'A4' ? 'A4' : '80mm');
export const setPrintFmt = (f: PrintFmt) => safeLS('set', PRINT_FMT, f);
