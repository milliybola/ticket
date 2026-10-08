/* Business rules of the platform (PRD + user stories US-01…US-43), on top of the local database. */
import { getLang, inLang, t3, tl, tx3, withLang, type L10n, type Lang } from '../lib/i18n';
import { addDays, dateKey, DAY, dowOf, fmtDate, fmtDT, HOUR, minOf, MIN, now, timeOf, tkMs, todayKey } from '../lib/time';
import { fmtPhone, nfmt } from '../lib/format';
import { byId, clone, groupBy, hash32, randInt, sumBy, uid } from '../lib/util';
import { getDb, m, tx } from '../store/db';
import { getAuth } from '../store/auth';
import { capacityOf, catOf, catsUsed, defaultCats, seatsOf, sellables, validateScheme } from './scheme';
import type {
  Buyer,
  Channel,
  Db,
  DayHours,
  EventItem,
  EventKind,
  Hall,
  Hold,
  HoldItem,
  Order,
  Org,
  PayMethod,
  Scheme,
  SchemeEl,
  Session,
  Ticket,
  TicketType,
  Venue,
  Visitor,
} from './types';

// ---------------------------------------------------------------- kinds, cities, statuses

export type PricingMode = 'element' | 'types' | 'museum';
export const KIND: Record<EventKind, { one: L10n; many: L10n; pricing: PricingMode; venue: 'scheme' | 'timed'; postpone: boolean; recurring: boolean; halls: boolean; icon: string }> = {
  concert: { one: tx3('Konsert', 'Концерт', 'Concert'), many: tx3('Konsertlar', 'Концерты', 'Concerts'), pricing: 'element', venue: 'scheme', postpone: true, recurring: false, halls: false, icon: 'mic' },
  theatre: { one: tx3('Spektakl', 'Спектакль', 'Play'), many: tx3('Teatr', 'Театр', 'Theatre'), pricing: 'types', venue: 'scheme', postpone: false, recurring: true, halls: false, icon: 'drama' },
  cinema: { one: tx3('Film', 'Фильм', 'Film'), many: tx3('Kino', 'Кино', 'Cinema'), pricing: 'types', venue: 'scheme', postpone: false, recurring: false, halls: true, icon: 'film' },
  museum: { one: tx3('Muzey', 'Музей', 'Museum'), many: tx3('Muzeylar', 'Музеи', 'Museums'), pricing: 'museum', venue: 'timed', postpone: false, recurring: false, halls: false, icon: 'landmark' },
  sport: { one: tx3('Sport oʻyini', 'Спортивный матч', 'Sports match'), many: tx3('Sport', 'Спорт', 'Sport'), pricing: 'element', venue: 'scheme', postpone: true, recurring: false, halls: false, icon: 'trophy' },
  event: { one: tx3('Tadbir', 'Мероприятие', 'Event'), many: tx3('Tadbirlar', 'Мероприятия', 'Events'), pricing: 'element', venue: 'scheme', postpone: true, recurring: false, halls: false, icon: 'sparkles' },
};
export const kindName = (k: EventKind) => tl(KIND[k].one);
export const kindPlural = (k: EventKind) => tl(KIND[k].many);
export const pricingOf = (k: EventKind) => KIND[k].pricing;

export const CITIES = (
  [
    ['tashkent', 'Toshkent', 'Ташкент', 'Tashkent'],
    ['samarkand', 'Samarqand', 'Самарканд', 'Samarkand'],
    ['bukhara', 'Buxoro', 'Бухара', 'Bukhara'],
    ['khiva', 'Xiva', 'Хива', 'Khiva'],
    ['namangan', 'Namangan', 'Наманган', 'Namangan'],
    ['fergana', 'Fargʻona', 'Фергана', 'Fergana'],
    ['andijan', 'Andijon', 'Андижан', 'Andijan'],
    ['nukus', 'Nukus', 'Нукус', 'Nukus'],
    ['karshi', 'Qarshi', 'Карши', 'Karshi'],
    ['termez', 'Termiz', 'Термез', 'Termez'],
    ['shahrisabz', 'Shahrisabz', 'Шахрисабз', 'Shahrisabz'],
    ['urgench', 'Urganch', 'Ургенч', 'Urgench'],
  ] as const
).map(([id, uz, ru, en]) => ({ id, name: tx3(uz, ru, en) }));
export const cityName = (id: string) => tl(CITIES.find((c) => c.id === id)?.name || id);

export const STATUS: Record<EventItem['status'], L10n> = {
  draft: tx3('Qoralama', 'Черновик', 'Draft'),
  moderation: tx3('Moderatsiyada', 'На модерации', 'In moderation'),
  published: tx3('Eʼlon qilingan', 'Опубликовано', 'Published'),
  rework: tx3('Tuzatish kerak', 'На доработке', 'Needs changes'),
};
export const ORG_STATUS = {
  review: tx3('Tekshiruvda', 'На проверке', 'Under review'),
  approved: tx3('Tasdiqlangan', 'Одобрен', 'Approved'),
  rework: tx3('Tuzatish kerak', 'На доработке', 'Needs changes'),
};
export const PAY_METHODS: { id: PayMethod; label: string; online: boolean; foreign?: boolean }[] = [
  { id: 'payme', label: 'Payme', online: true },
  { id: 'click', label: 'Click', online: true },
  { id: 'uzum', label: 'Uzum', online: true },
  { id: 'humo', label: 'Humo', online: true },
  { id: 'uzcard', label: 'Uzcard', online: true },
  { id: 'visa', label: 'Visa', online: true, foreign: true },
  { id: 'mastercard', label: 'Mastercard', online: true, foreign: true },
  { id: 'cash', label: 'Naqd', online: false },
  { id: 'qr', label: 'QR', online: false },
];

// ---------------------------------------------------------------- lookups

export const getOrg = (id: string | null | undefined) => byId(getDb().orgs, id);
export const getVenue = (id: string | null | undefined) => byId(getDb().venues, id);
export const getEvent = (id: string | null | undefined) => byId(getDb().events, id);
export const getSession = (id: string | null | undefined) => byId(getDb().sessions, id);
export const getScheme = (id: string | null | undefined): Scheme | undefined => (id ? getDb().schemes[id] : undefined);
export const getOrder = (id: string | null | undefined) => byId(getDb().orders, id);
export const getTicket = (id: string | null | undefined) => byId(getDb().tickets, id);
export const hallOf = (venue: Venue | undefined, hallId: string | null | undefined): Hall | undefined =>
  (venue && (venue.halls.find((h) => h.id === hallId) || (venue.deletedHalls || []).find((h) => h.id === hallId))) || venue?.halls[0];
export const eventSessions = (evId: string) => getDb().sessions.filter((s) => s.eventId === evId).sort((a, b) => a.startsAt - b.startsAt);
export const ticketsBySid = () => m('tbs', () => groupBy(getDb().tickets, (t) => t.sid));
export const ordersBySid = () => m('obs', () => groupBy(getDb().orders, (o) => o.sid));

// ---------------------------------------------------------------- actor, journal, notifications

export function actor(): Db['log'][number]['who'] {
  const a = getAuth();
  const path = typeof location !== 'undefined' ? location.pathname : '';
  if (path.startsWith('/mod') && a.modId) {
    const mo = byId(getDb().mods, a.modId);
    return { role: 'mod', id: a.modId, name: mo?.name || '' };
  }
  if ((path.startsWith('/org') || path.startsWith('/box') || path.startsWith('/entry')) && a.orgId) {
    const o = getOrg(a.orgId);
    return { role: 'org', id: a.orgId, name: o?.name || '' };
  }
  return { role: 'buyer', id: a.clientId, name: t3('Xaridor', 'Покупатель', 'Buyer') };
}
export function logAct(act: string, obj = '', details = '', who?: Db['log'][number]['who']) {
  const d = getDb();
  d.log.unshift({ id: uid('l'), at: now(), who: who || actor(), act, obj, details });
  if (d.log.length > 800) d.log.length = 800;
}
/** "Sends" an SMS or email: it lands in the outbox the moderator can read (no real gateway in this build). */
export function send(ch: 'sms' | 'email', to: string, subject: string, body: string, lang: Lang, tag: string) {
  const d = getDb();
  d.outbox.unshift({ id: uid('n'), at: now(), ch, to, subject, body, lang, tag });
  if (d.outbox.length > 500) d.outbox.length = 500;
}

// ---------------------------------------------------------------- events and prices

export const evTitle = (ev: EventItem, lang?: Lang) => tl(ev.card.title, lang || getLang()) || t3('Nomsiz', 'Без названия', 'Untitled');
export const visibleTypes = (ev: EventItem) => (ev.types || []).filter((t) => !t.hidden).sort((a, b) => a.order - b.order);
export const eventScheme = (ev: EventItem) => getScheme(ev.schemeId);
export const sessionScheme = (s: Session | undefined) => getScheme(s?.schemeId);

/** Row label → number used by price tiers: "7" → 7, "C" → 3. */
export function rowNumber(row: number | string): number {
  if (typeof row === 'number') return row;
  if (/^d+$/.test(row)) return Number(row);
  let n = 0;
  for (const ch of row.toUpperCase()) if (ch >= 'A' && ch <= 'Z') n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
/** Price of a row from the element's tiers (rows 1–5: 500 000, rows 6–12: 350 000 …), or null. */
export function tierPrice(ev: EventItem, elId: string, row: number | string): number | null {
  const r = rowNumber(row);
  const t = (ev.prices.rows?.[elId] || []).find((x) => r >= x.from && r <= x.to && x.price > 0);
  return t ? t.price : null;
}
/** Every price an element can have (base and tiers). */
export function elPrices(ev: EventItem, el: SchemeEl): number[] {
  const own = [ev.prices.els[el.id], ...(ev.prices.rows?.[el.id] || []).map((t) => t.price)];
  // seats priced by category (plans imported from iticket): the categories this element uses
  const cats = ev.prices.cats ? [...new Set(el.type === 'fan' ? [el.cat || 'std'] : seatsOf(el).map((st) => st.cat))].map((c) => ev.prices.cats![c]) : [];
  return [...own, ...cats].filter((x): x is number => !!x && x > 0);
}
/**
 * Price of a seat for a ticket type. Concert-like events price by element (and optionally by row ranges);
 * theatre and cinema by type × seat category. Without a row, an element's lowest price is returned ("from").
 */
export function priceFor(ev: EventItem, el: SchemeEl, cat: string, typeId?: string | null, row?: number | string | null): number | null {
  if (pricingOf(ev.kind) === 'element') {
    if (row != null) return tierPrice(ev, el.id, row) ?? (ev.prices.els[el.id] || ev.prices.cats?.[cat] || null);
    if (el.type === 'fan' && !ev.prices.els[el.id]) return ev.prices.cats?.[el.cat || 'std'] || null;
    const all = elPrices(ev, el);
    return all.length ? Math.min(...all) : null;
  }
  const t = typeId ? ev.types.find((x) => x.id === typeId) : visibleTypes(ev)[0];
  if (!t) return null;
  return pricingOf(ev.kind) === 'museum' ? t.price || null : (t.prices || {})[cat] || null;
}
export function tablePrice(ev: EventItem, el: SchemeEl, whole: boolean): number | null {
  if (pricingOf(ev.kind) === 'element') {
    const p = ev.prices.tables[el.id] || {};
    return whole ? p.whole || null : p.seat || null;
  }
  const seatP = priceFor(ev, el, el.cat || 'std');
  return whole ? (seatP ? seatP * (el.tableSeats || 0) : null) : seatP;
}
/** Lowest price shown on the storefront card ("from …"). */
export function minPrice(ev: EventItem): number | null {
  return m('min:' + ev.id, () => {
    let ps: (number | null | undefined)[] = [];
    const pm = pricingOf(ev.kind);
    if (pm === 'element') {
      const scs = ev.kind === 'cinema' ? [] : [eventScheme(ev)].filter(Boolean) as Scheme[];
      for (const sc of scs)
        for (const el of sellables(sc)) {
          if (el.type === 'table') ps.push(el.mode !== 'whole' ? tablePrice(ev, el, false) : tablePrice(ev, el, true));
          else ps.push(...elPrices(ev, el));
        }
    } else if (pm === 'museum') ps = visibleTypes(ev).map((t) => t.price);
    else for (const t of visibleTypes(ev)) ps.push(...Object.values(t.prices || {}));
    const ok = ps.filter((p): p is number => !!p && p > 0);
    // an imported event whose plan isn't loaded yet still shows the source's "from" price
    return ok.length ? Math.min(...ok) : ev.extMinPrice || null;
  });
}
/** Seat categories that need a price, across all halls this event can use. */
export function eventCats(ev: EventItem) {
  const venue = getVenue(ev.venueId);
  if (!venue || ev.kind === 'museum') return [];
  const scs = ev.kind === 'cinema' ? venue.halls.map((h) => getScheme(h.schemeId)).filter(Boolean) as Scheme[] : ([eventScheme(ev)].filter(Boolean) as Scheme[]);
  const seen: Record<string, ReturnType<typeof catOf>> = {};
  for (const s of scs) for (const c of catsUsed(s)) seen[c.id] = seen[c.id] || c;
  const list = Object.values(seen);
  return list.length ? list : [catOf({ cats: defaultCats() }, 'std')];
}

// ---------------------------------------------------------------- museum slots

export const museumSid = (evId: string, date: string, start: string) => `m~${evId}~${date}~${start}`;
export function parseSid(sid: string): { museum: true; evId: string; date: string; start: string } | { museum: false; sessionId: string } {
  if (sid && sid.startsWith('m~')) {
    const [, evId, date, start] = sid.split('~');
    return { museum: true, evId, date, start };
  }
  return { museum: false, sessionId: sid };
}
/** Hours and slot length for one date. Days that already had sales keep the plan they were sold under (US-15, rule 4). */
export function dayCfg(ev: EventItem, date: string): { h: DayHours | undefined; slot: number; kept: boolean } {
  const mu = ev.museum!;
  const k = (mu.keep || {})[date];
  return k ? { h: k.h, slot: k.slot, kept: true } : { h: mu.hours[dowOf(date)], slot: mu.slot, kept: false };
}
export function museumDay(ev: EventItem, date: string): { open: boolean; reason: string; special?: boolean; h?: DayHours } {
  const mu = ev.museum!;
  const off = (mu.offDays || []).find((d) => d.date === date);
  if (off) return { open: false, reason: off.reason || t3('Ishlamaydigan kun', 'Нерабочий день', 'Closed'), special: true };
  const h = dayCfg(ev, date).h;
  if (!h || h.off) return { open: false, reason: t3('Dam olish kuni', 'Выходной', 'Closed') };
  const t = todayKey();
  if (date < t) return { open: false, reason: '' };
  if (date > addDays(t, mu.ahead || 30)) return { open: false, reason: t3('Sotuv hali ochilmagan', 'Продажа ещё не открыта', 'Sales not open yet') };
  return { open: true, reason: '', h };
}
export function museumSlotTimes(h: DayHours, slotMin: number) {
  const out: { start: string; end: string }[] = [];
  for (let s = minOf(h.open); s < minOf(h.close); s += slotMin) out.push({ start: timeOf(s), end: timeOf(Math.min(s + slotMin, minOf(h.close))) });
  return out;
}
export type MuseumSlot = { start: string; end: string; sid: string; limit: number; sold: number; left: number; past: boolean; startMs: number; endMs: number };
export function museumSlots(ev: EventItem, date: string, opts: { any?: boolean } = {}): MuseumSlot[] {
  const d = museumDay(ev, date);
  if (!d.open && !opts.any) return [];
  const cfg = dayCfg(ev, date);
  const h = d.h || cfg.h;
  if (!h || h.off) return [];
  const tbs = ticketsBySid();
  return museumSlotTimes(h, cfg.slot).map((s) => {
    const sid = museumSid(ev.id, date, s.start);
    const limit = ev.museum!.overrides[`${date}|${s.start}`] ?? ev.museum!.limit;
    const sold = (tbs[sid] || []).length;
    const taken = sold + heldCount(sid);
    const endMs = tkMs(date, s.end);
    return { ...s, sid, limit, sold, left: Math.max(0, limit - taken), past: now() >= endMs, startMs: tkMs(date, s.start), endMs };
  });
}

// ---------------------------------------------------------------- sale units

export type Unit = {
  sid: string;
  museum: boolean;
  ev: EventItem;
  venue: Venue | undefined;
  session: Session | null;
  scheme: Scheme | null;
  hall: Hall | null;
  startsAt: number;
  endsAt: number;
  date?: string;
  start?: string;
  end?: string;
  limit?: number;
};
/** Everything about a sellable unit: a session, or one museum slot. */
export function unitInfo(sid: string): Unit | null {
  const p = parseSid(sid);
  if (p.museum) {
    const ev = getEvent(p.evId);
    if (!ev || !ev.museum) return null;
    const venue = getVenue(ev.venueId);
    const cfg = dayCfg(ev, p.date);
    const slot = cfg.h ? museumSlotTimes(cfg.h, cfg.slot).find((s) => s.start === p.start) : null;
    const end = slot ? slot.end : timeOf(minOf(p.start) + cfg.slot);
    const limit = ev.museum.overrides[`${p.date}|${p.start}`] ?? ev.museum.limit;
    return { sid, museum: true, ev, venue, date: p.date, start: p.start, end, startsAt: tkMs(p.date, p.start), endsAt: tkMs(p.date, end), limit, scheme: null, hall: null, session: null };
  }
  const s = getSession(sid);
  if (!s) return null;
  const ev = getEvent(s.eventId);
  if (!ev) return null;
  const venue = getVenue(ev.venueId);
  return {
    sid,
    museum: false,
    ev,
    venue,
    session: s,
    startsAt: s.startsAt,
    endsAt: s.startsAt + (s.duration || ev.card.duration || 120) * MIN,
    scheme: sessionScheme(s) || null,
    hall: hallOf(venue, s.hallId) || null,
  };
}
export const unitWhen = (u: Unit) => (u.museum ? `${fmtDate(u.date!)}, ${u.start}–${u.end}` : fmtDT(u.startsAt));
/** The box office may sell up to 30 minutes after the start, e.g. to latecomers at the cinema (US-36). */
export const BOX_LATE_MIN = 30;
export function salesOpen(u: Unit | null, channel: Channel): boolean {
  if (!u) return false;
  if (u.ev.status !== 'published') return false;
  if (u.museum) {
    const d = museumDay(u.ev, u.date!);
    return d.open && now() < u.endsAt;
  }
  const until = channel === 'box' ? u.startsAt + BOX_LATE_MIN * MIN : u.session!.salesUntil || u.startsAt;
  return now() < until;
}

// ---------------------------------------------------------------- holds & occupancy (US-30, US-38)

export const HOLD_MS = 10 * MIN;
export const MAX_PER_ORDER = 10;
export const activeHolds = () => getDb().holds.filter((h) => h.paying || h.expiresAt > now());
export function heldCount(sid: string) {
  let n = 0;
  for (const h of activeHolds()) if (h.sid === sid) for (const it of h.items) if (it.k === 'slot') n += it.qty;
  return n;
}
export type Occupancy = { seats: Map<string, 'sold' | 'held'>; zones: Record<string, number>; wholeTables: Set<string>; slot: number };
/** Seats/zones/slots taken by sales and by other people's active holds. */
export function occupancy(sid: string, exceptHoldId?: string | null): Occupancy {
  const seats = new Map<string, 'sold' | 'held'>();
  const zones: Record<string, number> = {};
  const wholeTables = new Set<string>();
  let slot = 0;
  // seats already sold on iticket: everything of the plan that was not free when it was loaded
  const s = sid.startsWith('m~') ? undefined : getSession(sid);
  if (s?.extAvail && s.schemeId) {
    const free = new Set(s.extAvail);
    const sc = getScheme(s.schemeId);
    if (sc) for (const el of sc.els) if (el.type === 'seats' || el.type === 'lounge' || el.type === 'table') for (const st of seatsOf(el)) if (!free.has(st.key)) seats.set(st.key, 'sold');
  }
  for (const t of ticketsBySid()[sid] || []) {
    if (t.sk) seats.set(t.sk, 'sold');
    if (t.k === 'zone' && t.el) zones[t.el] = (zones[t.el] || 0) + 1;
    if (t.k === 'slot') slot++;
    if (t.whole && t.el) wholeTables.add(t.el);
  }
  for (const h of activeHolds()) {
    if (h.sid !== sid || h.id === exceptHoldId) continue;
    for (const it of h.items) {
      if (it.k === 'seat') seats.set(it.key, 'held');
      else if (it.k === 'table') {
        wholeTables.add(it.elId);
        for (const k of it.seats) seats.set(k, 'held');
      } else if (it.k === 'zone') zones[it.elId] = (zones[it.elId] || 0) + it.qty;
      else if (it.k === 'slot') slot += it.qty;
    }
  }
  return { seats, zones, wholeTables, slot };
}
export function unitStock(u: Unit): { total: number; free: number } {
  if (u.museum) {
    const taken = (ticketsBySid()[u.sid] || []).length + heldCount(u.sid);
    return { total: u.limit!, free: Math.max(0, u.limit! - taken) };
  }
  const sc = u.scheme;
  // an imported session whose plan isn't loaded yet: the count iticket reported
  if (!sc) return u.session?.extFree != null ? { total: u.session.extFree, free: u.session.extFree } : { total: 0, free: 0 };
  const occ = occupancy(u.sid);
  let total = 0;
  let free = 0;
  for (const el of sellables(sc)) {
    if (el.type === 'fan') {
      total += el.limit || 0;
      free += Math.max(0, (el.limit || 0) - (occ.zones[el.id] || 0));
    } else {
      const ss = seatsOf(el);
      total += ss.length;
      free += ss.filter((s) => !occ.seats.has(s.key)).length;
    }
  }
  return { total, free };
}
export const itemCount = (items: HoldItem[]) => sumBy(items, (it) => (it.k === 'zone' || it.k === 'slot' ? it.qty : it.k === 'table' ? it.seats.length : 1));
export const itemsTotal = (items: HoldItem[]) => sumBy(items, (it) => it.price * (it.k === 'zone' || it.k === 'slot' ? it.qty : 1));

/** Checks items against current stock. Returns the conflicting items. */
export function conflictsFor(sid: string, items: HoldItem[], exceptHoldId?: string | null): HoldItem[] {
  const u = unitInfo(sid);
  if (!u) return items;
  const occ = occupancy(sid, exceptHoldId);
  const bad: HoldItem[] = [];
  if (u.museum) {
    const want = sumBy(items.filter((i) => i.k === 'slot'), (i) => (i.k === 'slot' ? i.qty : 0));
    if (occ.slot + want > (u.limit || 0)) bad.push(...items);
    return bad;
  }
  const sc = u.scheme!;
  for (const it of items) {
    if (it.k === 'seat') {
      if (occ.seats.has(it.key)) bad.push(it);
      else {
        const el = sc.els.find((e) => e.id === it.elId);
        if (el && el.type === 'table' && occ.wholeTables.has(el.id)) bad.push(it);
      }
    }
    if (it.k === 'table' && (occ.wholeTables.has(it.elId) || it.seats.some((k) => occ.seats.has(k)))) bad.push(it);
    if (it.k === 'zone') {
      const el = sc.els.find((e) => e.id === it.elId);
      if (!el || (occ.zones[it.elId] || 0) + it.qty > (el.limit || 0)) bad.push(it);
    }
  }
  return bad;
}
/** Holds the selection for 10 minutes. One active hold per holder: a new hold replaces the old one (US-30). */
export function createHold(sid: string, items: HoldItem[], channel: Channel, holder: string): { ok: true; hold: Hold } | { ok: false; bad: HoldItem[] } {
  return tx((d) => {
    d.holds = d.holds.filter((h) => !(h.holder === holder && !h.paying));
    const bad = conflictsFor(sid, items, null);
    if (bad.length) return { ok: false as const, bad };
    const h: Hold = { id: uid('h'), sid, channel, holder, items, createdAt: now(), expiresAt: now() + HOLD_MS, paying: false, lang: getLang() };
    d.holds.push(h);
    if (channel === 'online') logAct('hold', sid, `${itemCount(items)}`);
    return { ok: true as const, hold: h };
  });
}
export const dropHold = (holdId: string) =>
  tx((d) => {
    d.holds = d.holds.filter((h) => h.id !== holdId);
  });
export const getHold = (holdId: string | null | undefined) => getDb().holds.find((h) => h.id === holdId) || null;
export const holdAlive = (h: Hold | null) => !!h && (h.paying || h.expiresAt > now());
export function cleanupHolds() {
  const d = getDb();
  if (!d.holds.some((h) => !h.paying && h.expiresAt <= now())) return false;
  tx((db) => {
    db.holds = db.holds.filter((h) => h.paying || h.expiresAt > now());
  });
  return true;
}
export const markPaying = (holdId: string, on: boolean) =>
  tx((d) => {
    const h = d.holds.find((x) => x.id === holdId);
    if (h) {
      h.paying = on;
      if (!on && h.expiresAt < now()) h.expiresAt = now();
    }
  });

// ---------------------------------------------------------------- orders & tickets (US-33, US-34)

const QR_SECRET = 'sayohat-local';
export const ticketCode = (id: string) => `SYH1.${id}.${hash32(id + QR_SECRET).toString(36)}`;
export function parseCode(code: string): string | null {
  const mm = String(code || '').trim().match(/^SYH1\.([a-z0-9]+)\.([a-z0-9]+)$/i);
  if (!mm) return null;
  if (hash32(mm[1] + QR_SECRET).toString(36) !== mm[2]) return null;
  return mm[1];
}
function newOrderNo(d: Db) {
  let n: string;
  do n = 'SY-' + randInt(200000, 999999);
  while (d.orders.some((o) => o.id === n));
  return n;
}
const fiscal = (total: number) => ({ no: String(randInt(10000000, 99999999)), sign: String(randInt(100000000, 999999999)) + String(randInt(100, 999)), terminal: 'EZ000' + randInt(1000000, 9999999), at: now(), total });

/**
 * Turns a hold into a paid order. Works even if the hold timed out while the payment system answered,
 * as long as the places are still free (US-33 AC4).
 */
export function completeOrder(holdSnap: Hold, buyer: Buyer, visitors: (Visitor | null)[] | null, pay: Order['pay']): { ok: true; order: Order } | { ok: false; reason: 'taken'; late: boolean } {
  return tx((d) => {
    const live = d.holds.find((h) => h.id === holdSnap.id);
    const bad = conflictsFor(holdSnap.sid, holdSnap.items, holdSnap.id);
    if (bad.length) {
      d.holds = d.holds.filter((h) => h.id !== holdSnap.id);
      logAct('pay-conflict', holdSnap.sid, t3('Toʻlov brondan keyin keldi, joylar sotilgan — yordamga uzatildi', 'Оплата пришла после брони, места уже проданы — передано в поддержку', 'Payment arrived after the hold, places already sold: sent to support'));
      return { ok: false as const, reason: 'taken' as const, late: !live };
    }
    const u = unitInfo(holdSnap.sid)!;
    const ev = u.ev;
    const id = newOrderNo(d);
    const total = itemsTotal(holdSnap.items);
    const auth = getAuth();
    const order: Order = { id, sid: holdSnap.sid, ev: ev.id, ch: holdSnap.channel, buyer, lang: holdSnap.lang || getLang(), total, pay, at: now(), fiscal: fiscal(total), tickets: [], prints: 0 };
    const mk = (base: Partial<Ticket> & Pick<Ticket, 'k' | 'lb' | 'p'>) => {
      const tid = uid('t');
      const t: Ticket = { id: tid, code: ticketCode(tid), oid: id, sid: holdSnap.sid, ev: ev.id, ch: holdSnap.channel, at: now(), used: null, denied: [], ...base };
      d.tickets.push(t);
      order.tickets.push(tid);
      return t;
    };
    const typeBits = (typeId?: string | null) => {
      const ty = typeId ? ev.types.find((x) => x.id === typeId) : null;
      return ty ? { ty: ty.id, tn: ty.name, rq: ty.req && (ty.req.uz || ty.req.ru || ty.req.en) ? ty.req : null } : {};
    };
    let vi = 0;
    for (const it of holdSnap.items) {
      if (it.k === 'seat') mk({ k: 'seat', sk: it.key, el: it.elId, lb: it.label, p: it.price, ...typeBits(it.typeId) });
      else if (it.k === 'table') it.seats.forEach((k, i) => mk({ k: 'seat', sk: k, el: it.elId, whole: true, lb: it.seatLabels[i], p: Math.round(it.price / it.seats.length) }));
      else if (it.k === 'zone') for (let i = 0; i < it.qty; i++) mk({ k: 'zone', el: it.elId, lb: it.label, p: it.price });
      else if (it.k === 'slot')
        for (let i = 0; i < it.qty; i++) {
          const v = (visitors || [])[vi++] || null;
          mk({ k: 'slot', lb: it.label, p: it.price, v, ...typeBits(it.typeId) });
        }
    }
    d.orders.push(order);
    d.holds = d.holds.filter((h) => h.id !== holdSnap.id);
    const L = order.lang;
    const title = evTitle(ev, L);
    const when = withLang(L, () => unitWhen(u));
    if (buyer.email)
      send(
        'email',
        buyer.email,
        inLang(L, `Chiptalaringiz: ${title}`, `Ваши билеты: ${title}`, `Your tickets: ${title}`),
        inLang(L, `Buyurtma ${id}. ${title}, ${when}. QR-chiptalar va fiskal chek ilovada.`, `Заказ ${id}. ${title}, ${when}. Билеты с QR и фискальный чек во вложении.`, `Order ${id}. ${title}, ${when}. Tickets with QR codes and the fiscal receipt are attached.`),
        L,
        'tickets',
      );
    if (holdSnap.channel !== 'box')
      send('sms', buyer.phone, '', inLang(L, `Sayohat: buyurtma ${id}, ${title}, ${when}. Chiptalar: sayohat.uz/t/${id}`, `Sayohat: заказ ${id}, ${title}, ${when}. Билеты: sayohat.uz/t/${id}`, `Sayohat: order ${id}, ${title}, ${when}. Tickets: sayohat.uz/t/${id}`), L, 'tickets');
    logAct(holdSnap.channel === 'box' ? 'sale-box' : 'sale-online', id, `${title} · ${order.tickets.length} · ${nfmt(total)}`);
    if (auth.buyerId && holdSnap.channel === 'online') {
      const b = byId(d.buyers, auth.buyerId);
      if (b && b.phone === buyer.phone) order.account = b.id;
    }
    return { ok: true as const, order };
  });
}
export const orderTickets = (o: Order) => o.tickets.map(getTicket).filter(Boolean) as Ticket[];
/** "Find ticket" (US-34): by phone and order number; never tells whether the phone has other orders. */
export function findOrder(phone: string, orderNo: string) {
  const id = orderNo.trim().toUpperCase().replace(/^SY(\d)/, 'SY-$1');
  const o = getOrder(id);
  return o && o.buyer.phone === phone ? o : null;
}
export function markPrinted(orderId: string) {
  tx((d) => {
    const o = byId(d.orders, orderId);
    if (o) {
      o.prints++;
      logAct(o.prints > 1 ? 'reprint' : 'print', o.id, '');
    }
  });
}

// ---------------------------------------------------------------- entry check (US-41, US-42)

export type EntryCtx = { key: string; ev: EventItem; startsAt: number; museum: boolean; date?: string; session?: Session };
export function entryContexts(orgId: string): EntryCtx[] {
  const list: EntryCtx[] = [];
  const t = todayKey();
  for (const ev of getDb().events.filter((e) => e.orgId === orgId && (e.status === 'published' || e.firstPublishedAt))) {
    if (ev.kind === 'museum') {
      for (let i = -1; i <= 1; i++) {
        const dd = addDays(t, i);
        if (museumSlots(ev, dd, { any: true }).length) list.push({ key: `md~${ev.id}~${dd}`, ev, date: dd, museum: true, startsAt: tkMs(dd, dayCfg(ev, dd).h?.open || '09:00') });
      }
    } else {
      for (const s of eventSessions(ev.id)) if (s.startsAt > now() - 6 * HOUR && s.startsAt < now() + 3 * DAY) list.push({ key: s.id, ev, session: s, startsAt: s.startsAt, museum: false });
    }
  }
  return list.sort((a, b) => a.startsAt - b.startsAt);
}
export function ctxTickets(ctx: EntryCtx | null): Ticket[] {
  if (!ctx) return [];
  if (ctx.museum) return getDb().tickets.filter((x) => x.ev === ctx.ev.id && (parseSid(x.sid) as { date?: string }).date === ctx.date);
  return ticketsBySid()[ctx.key] || [];
}
export type CheckResult =
  | { res: 'notfound' }
  | { res: 'other'; t: Ticket }
  | { res: 'used'; t: Ticket }
  | { res: 'early'; t: Ticket; from: string }
  | { res: 'late'; t: Ticket }
  | { res: 'confirm'; t: Ticket }
  | { res: 'ok'; t: Ticket };
/** Classifies a scanned code for the chosen session. Tickets with a requirement wait for "Let in" (US-42). */
export function checkTicket(code: string, ctx: EntryCtx, source?: Map<string, Ticket>): CheckResult {
  const tid = parseCode(code) || (String(code).startsWith('t') ? String(code) : null);
  const t = tid ? (source ? source.get(tid) : getTicket(tid)) : undefined;
  if (!t) return { res: 'notfound' };
  if (ctx.museum) {
    const p = parseSid(t.sid);
    if (t.ev !== ctx.ev.id || !p.museum || p.date !== ctx.date) return { res: 'other', t };
    const u = unitInfo(t.sid)!;
    if (t.used) return { res: 'used', t };
    if (now() < u.startsAt) return { res: 'early', t, from: u.start! };
    if (now() >= u.endsAt) return { res: 'late', t };
  } else {
    if (t.sid !== ctx.key) return { res: 'other', t };
    if (t.used) return { res: 'used', t };
  }
  if (t.rq) return { res: 'confirm', t };
  return { res: 'ok', t };
}
export function markUsed(tid: string, device = 'entry'): { ok: boolean; already?: number } {
  return tx((d) => {
    const t = byId(d.tickets, tid);
    if (!t) return { ok: false };
    if (t.used) return { ok: false, already: t.used };
    t.used = now();
    t.usedBy = device;
    logAct('entry-pass', t.oid, tl(t.lb));
    return { ok: true };
  });
}
export const markDenied = (tid: string) =>
  tx((d) => {
    const t = byId(d.tickets, tid);
    if (t) {
      t.denied.push(now());
      logAct('entry-deny', t.oid, `${tl(t.tn)} · ${tl(t.lb)}`);
    }
  });

// ---------------------------------------------------------------- organizers (US-01 … US-03)

export function registerOrg(data: Pick<Org, 'name' | 'kinds' | 'contact' | 'phone' | 'email' | 'password' | 'lang'>): { ok: true; org: Org } | { ok: false; field: 'phone' | 'email' } {
  return tx((d) => {
    if (d.orgs.some((o) => o.phone === data.phone)) return { ok: false as const, field: 'phone' as const };
    if (d.orgs.some((o) => o.email.toLowerCase() === data.email.toLowerCase())) return { ok: false as const, field: 'email' as const };
    const org: Org = { id: uid('org'), ...data, status: 'review', createdAt: now(), submittedAt: now(), resubmitted: false, changed: [], history: [{ at: now(), by: '', decision: 'submitted', reason: '' }] };
    d.orgs.push(org);
    send('email', org.email, inLang(org.lang, 'Anketa qabul qilindi', 'Анкета получена', 'Application received'), inLang(org.lang, 'Anketa qabul qilindi, uni moderator tekshiradi.', 'Анкета получена, её проверяет модератор.', 'Your application is received; a moderator is checking it.'), org.lang, 'org');
    logAct('org-register', org.name, '', { role: 'org', id: org.id, name: org.name });
    return { ok: true as const, org };
  });
}
export function resubmitOrg(orgId: string, patch: Partial<Pick<Org, 'name' | 'kinds' | 'contact' | 'phone' | 'email'>>) {
  return tx((d) => {
    const o = byId(d.orgs, orgId)!;
    const changed: string[] = [];
    const prev: Org['prev'] = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      if (JSON.stringify(o[k]) !== JSON.stringify(patch[k])) {
        changed.push(k);
        (prev as Record<string, unknown>)[k] = o[k];
      }
    }
    Object.assign(o, patch);
    o.status = 'review';
    o.resubmitted = true;
    o.changed = changed;
    o.prev = prev;
    o.submittedAt = now();
    o.history.push({ at: now(), by: '', decision: 'resubmitted', reason: '' });
    send('email', o.email, inLang(o.lang, 'Anketa qayta yuborildi', 'Анкета отправлена повторно', 'Application resubmitted'), inLang(o.lang, 'Anketa qayta yuborildi, moderator tekshiradi.', 'Анкета отправлена повторно, её проверяет модератор.', 'Your application was resubmitted.'), o.lang, 'org');
    logAct('org-resubmit', o.name, changed.join(', '));
  });
}
export function decideOrg(orgId: string, decision: 'approved' | 'rework', reason: string, modName: string) {
  return tx((d) => {
    const o = byId(d.orgs, orgId)!;
    if (o.status !== 'review') {
      const last = o.history.filter((h) => h.decision === 'approved' || h.decision === 'rework').slice(-1)[0];
      return { ok: false as const, already: last };
    }
    o.status = decision;
    o.history.push({ at: now(), by: modName, decision, reason: reason || '' });
    o.resubmitted = false;
    if (decision === 'approved')
      send('email', o.email, inLang(o.lang, 'Akkaunt tekshirildi', 'Аккаунт проверен', 'Your account is verified'), inLang(o.lang, 'Akkauntingiz tekshirildi. Endi tadbirlarni eʼlon qilish uchun yuborishingiz mumkin.', 'Ваш аккаунт проверен. Теперь вы можете отправлять мероприятия на публикацию.', 'Your account is verified. You can now send events for publication.'), o.lang, 'org');
    else send('email', o.email, inLang(o.lang, 'Anketani tuzatish kerak', 'Анкету нужно исправить', 'Your application needs changes'), inLang(o.lang, `Anketani tuzatish kerak. Sabab: ${reason}`, `Анкету нужно исправить. Причина: ${reason}`, `Your application needs changes. Reason: ${reason}`), o.lang, 'org');
    logAct(decision === 'approved' ? 'org-approve' : 'org-return', o.name, reason || '');
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------- venues (US-04, US-05, US-11)

export const venueEvents = (venueId: string) => getDb().events.filter((e) => e.venueId === venueId || e.venueChange?.to === venueId);
export function hallSessionsWithSales(hallId: string) {
  const tbs = ticketsBySid();
  return getDb().sessions.filter((s) => s.hallId === hallId && s.startsAt > now() && ((tbs[s.id] || []).length || activeHolds().some((h) => h.sid === s.id)));
}

// ---------------------------------------------------------------- moderation of events (US-21 … US-23)

export type CheckItem = { key: 'card' | 'venue' | 'prices' | 'sessions'; ok: boolean; label: string; hint: string };
export function eventChecklist(ev: EventItem): CheckItem[] {
  const venue = getVenue(ev.venueId);
  const items: CheckItem[] = [];
  const titleOk = !!(ev.card.title && (ev.card.title.uz || ev.card.title.ru || ev.card.title.en));
  items.push({ key: 'card', ok: titleOk, label: t3('Kartochka', 'Карточка', 'Event card'), hint: titleOk ? '' : t3('Nomini kiriting', 'Укажите название', 'Enter the title') });
  let schemeOk = !!venue;
  let schemeHint = venue ? '' : t3('Maydonni tanlang', 'Выберите площадку', 'Choose a venue');
  if (venue && ev.kind !== 'museum') {
    const scs = ev.kind === 'cinema' ? (venue.halls.map((h) => getScheme(h.schemeId)).filter(Boolean) as Scheme[]) : ([eventScheme(ev)].filter(Boolean) as Scheme[]);
    const errs = scs.flatMap((s) => validateScheme(s));
    if (!scs.length || scs.every((s) => !sellables(s).length)) {
      schemeOk = false;
      schemeHint = t3('Sxemada sotiladigan sektor yoʻq', 'В схеме нет продаваемых секторов', 'The plan has no sellable sectors');
    } else if (errs.length) {
      schemeOk = false;
      schemeHint = errs[0].msg;
    }
  }
  items.push({ key: 'venue', ok: schemeOk, label: t3('Maydon va sxema', 'Площадка и схема', 'Venue and seating plan'), hint: schemeHint });
  let priceOk = true;
  let priceHint = '';
  const pm = pricingOf(ev.kind);
  if (pm === 'element') {
    const sc = eventScheme(ev);
    const miss = sc
      ? sellables(sc).filter((el) =>
          el.type === 'table' ? (el.mode !== 'seats' && !tablePrice(ev, el, true)) || (el.mode !== 'whole' && !tablePrice(ev, el, false)) : !elementPriced(ev, el),
        )
      : [];
    if (miss.length) {
      priceOk = false;
      priceHint = t3('Narx yoʻq: {s}', 'Нет цены: {s}', 'No price: {s}', { s: miss.map((e) => e.name).join(', ') });
    }
  } else {
    const vt = visibleTypes(ev);
    if (!vt.length) {
      priceOk = false;
      priceHint = t3('Kamida bitta chipta turini qoʻshing', 'Добавьте хотя бы один тип билета', 'Add at least one ticket type');
    } else if (pm === 'museum') {
      if (vt.some((t) => !((t.price || 0) > 0))) {
        priceOk = false;
        priceHint = t3('Chipta turida narx yoʻq', 'У типа нет цены', 'A ticket type has no price');
      }
    } else {
      const cats = eventCats(ev);
      const miss = vt.filter((t) => cats.some((c) => !(((t.prices || {})[c.id] || 0) > 0)));
      if (miss.length) {
        priceOk = false;
        priceHint = t3('«{t}» turida toifa narxi yoʻq', 'Нет цены для категории у типа «{t}»', 'Type "{t}" has no price for a category', { t: tl(miss[0].name) });
      }
    }
  }
  items.push({ key: 'prices', ok: priceOk, label: t3('Narxlar', 'Цены', 'Prices'), hint: priceHint });
  let sessOk: boolean;
  let sessHint = '';
  if (ev.kind === 'museum') {
    sessOk = !!ev.museum && Object.values(ev.museum.hours).some((h) => !h.off) && ev.museum.limit > 0;
    if (!sessOk) sessHint = t3('Ish grafigini kiriting', 'Задайте график работы', 'Set the opening hours');
  } else {
    sessOk = eventSessions(ev.id).some((s) => s.startsAt > now());
    if (!sessOk) sessHint = t3('Kamida bitta kelgusi seans qoʻshing', 'Добавьте хотя бы один будущий сеанс', 'Add at least one upcoming session');
  }
  items.push({ key: 'sessions', ok: sessOk, label: ev.kind === 'museum' ? t3('Grafik', 'График', 'Opening hours') : t3('Seanslar', 'Сеансы', 'Sessions'), hint: sessHint });
  return items;
}
/** Every seat of the element has a price: a base price, or tiers that cover all its rows. */
export function elementPriced(ev: EventItem, el: SchemeEl) {
  if ((ev.prices.els[el.id] || 0) > 0) return true;
  if (ev.prices.cats) {
    const catOk = (c: string) => (ev.prices.cats![c] || 0) > 0;
    if (el.type === 'fan' ? catOk(el.cat || 'std') : seatsOf(el).every((st) => tierPrice(ev, el.id, st.row) != null || catOk(st.cat))) return true;
  }
  if (el.type === 'fan' || !ev.prices.rows?.[el.id]?.length) return false;
  return seatsOf(el).every((st) => tierPrice(ev, el.id, st.row) != null);
}
export function submitEvent(evId: string): { ok: boolean; reason?: string } {
  const ev = getEvent(evId)!;
  const org = getOrg(ev.orgId)!;
  if (org.status !== 'approved') return { ok: false, reason: t3('Avval tashkilotchi tekshiruvdan oʻtishi kerak', 'Сначала нужна проверка организатора', 'Your organizer account must be approved first') };
  if (eventChecklist(ev).some((c) => !c.ok)) return { ok: false, reason: t3('Roʻyxatdagi bandlarni bajaring', 'Выполните пункты чек-листа', 'Complete the checklist') };
  tx((d) => {
    const e = byId(d.events, evId)!;
    e.resubmitted = e.status === 'rework';
    e.status = 'moderation';
    e.submittedAt = now();
    e.history.push({ at: now(), by: '', decision: e.resubmitted ? 'resubmitted' : 'submitted', reason: '' });
    send('email', org.email, inLang(org.lang, 'Tadbir moderatsiyaga yuborildi', 'Мероприятие отправлено на модерацию', 'Event sent for moderation'), inLang(org.lang, `«${evTitle(e, org.lang)}» moderatsiyaga yuborildi. Qaror email orqali keladi.`, `«${evTitle(e, org.lang)}» отправлено на модерацию. Решение придёт на email.`, `"${evTitle(e, org.lang)}" is sent for moderation. The decision will come by email.`), org.lang, 'org');
    logAct('event-submit', evTitle(e));
  });
  return { ok: true };
}
export const withdrawEvent = (evId: string) =>
  tx((d) => {
    const e = byId(d.events, evId)!;
    if (e.status !== 'moderation') return;
    e.status = 'draft';
    e.history.push({ at: now(), by: '', decision: 'withdrawn', reason: '' });
    logAct('event-withdraw', evTitle(e));
  });
export function decideEvent(evId: string, decision: 'approved' | 'rework', reason: string, modName: string) {
  return tx((d) => {
    const ev = byId(d.events, evId)!;
    const org = byId(d.orgs, ev.orgId)!;
    if (ev.status !== 'moderation') {
      const last = ev.history.filter((h) => h.decision === 'approved' || h.decision === 'rework').slice(-1)[0];
      return { ok: false as const, already: last };
    }
    ev.status = decision === 'approved' ? 'published' : 'rework';
    ev.history.push({ at: now(), by: modName, decision, reason: reason || '' });
    if (decision === 'approved' && !ev.firstPublishedAt) ev.firstPublishedAt = now();
    const T = evTitle(ev, org.lang);
    if (decision === 'approved')
      send('email', org.email, inLang(org.lang, `Tadbir eʼlon qilindi: ${T}`, `Мероприятие опубликовано: ${T}`, `Event published: ${T}`), inLang(org.lang, `«${T}» eʼlon qilindi, sotuv ochildi. Sahifa: sayohat.uz/e/${ev.id}`, `«${T}» опубликовано, продажи открыты. Страница: sayohat.uz/e/${ev.id}`, `"${T}" is published and on sale. Page: sayohat.uz/e/${ev.id}`), org.lang, 'org');
    else send('email', org.email, inLang(org.lang, `Tuzatish kerak: ${T}`, `Нужно исправить: ${T}`, `Changes needed: ${T}`), inLang(org.lang, `Tuzatish kerak. Sabab: ${reason}`, `Нужно исправить. Причина: ${reason}`, `Changes needed. Reason: ${reason}`), org.lang, 'org');
    logAct(decision === 'approved' ? 'event-approve' : 'event-return', evTitle(ev), reason || '');
    return { ok: true as const };
  });
}
/** Sends a venue change of a published event for review (US-23). Seated venues can't change once places are sold. */
export function requestVenueChange(evId: string, toVenueId: string): { ok: boolean; reason?: string } {
  const ev = getEvent(evId)!;
  if (ev.venueChange?.status === 'pending') return { ok: false, reason: t3('Oldingi almashtirish hali tekshiruvda', 'Предыдущая смена ещё на проверке', 'The previous change is still under review') };
  const from = getVenue(ev.venueId);
  const sold = getDb().tickets.some((t) => t.ev === ev.id);
  if (from?.type === 'scheme' && sold) return { ok: false, reason: t3('Joylar sotilgan: qaytarishlar paydo boʻlguncha almashtirib boʻlmaydi', 'Места проданы: смена недоступна до появления возвратов', 'Places are sold: the venue can’t change until refunds exist') };
  tx((d) => {
    const e = byId(d.events, evId)!;
    e.venueChange = { from: e.venueId!, to: toVenueId, status: 'pending', submittedAt: now() };
    logAct('venue-change', evTitle(e), `${from?.name} → ${getVenue(toVenueId)?.name}`);
  });
  return { ok: true };
}
export function decideVenueChange(evId: string, decision: 'approved' | 'rework', reason: string, modName: string) {
  return tx((d) => {
    const ev = byId(d.events, evId)!;
    const org = byId(d.orgs, ev.orgId)!;
    const vc = ev.venueChange;
    if (!vc || vc.status !== 'pending') return { ok: false as const, already: ev.vcHistory.slice(-1)[0] };
    ev.vcHistory.push({ at: now(), by: modName, decision, reason: reason || '', from: vc.from, to: vc.to });
    const T = evTitle(ev, org.lang);
    if (decision === 'approved') {
      const nv = byId(d.venues, vc.to)!;
      ev.venueId = vc.to;
      if (nv.type === 'scheme' && nv.halls[0]) {
        const sid = uid('sch');
        d.schemes[sid] = clone(d.schemes[nv.halls[0].schemeId]);
        ev.schemeId = sid;
        for (const s of d.sessions.filter((x) => x.eventId === ev.id)) {
          s.schemeId = sid;
          s.hallId = nv.halls[0].id;
        }
      }
      const addr = `${nv.name}, ${cityName(nv.city)}, ${nv.address}`;
      for (const o of d.orders.filter((x) => x.ev === ev.id)) {
        const BT = evTitle(ev, o.lang);
        send('sms', o.buyer.phone, '', inLang(o.lang, `Sayohat: «${BT}» oʻtkaziladigan joy oʻzgardi: ${addr}`, `Sayohat: изменилось место проведения «${BT}»: ${addr}`, `Sayohat: new venue for "${BT}": ${addr}`), o.lang, 'venue');
        if (o.buyer.email) send('email', o.buyer.email, inLang(o.lang, 'Oʻtkaziladigan joy oʻzgardi', 'Изменилось место проведения', 'The venue has changed'), inLang(o.lang, `Oʻtkaziladigan joy oʻzgardi: ${addr}`, `Изменилось место проведения: ${addr}`, `The venue has changed: ${addr}`), o.lang, 'venue');
      }
    }
    ev.venueChange = null;
    send('email', org.email, inLang(org.lang, `Maydonni almashtirish: ${T}`, `Смена площадки: ${T}`, `Venue change: ${T}`), decision === 'approved' ? inLang(org.lang, 'Maydonni almashtirish tasdiqlandi.', 'Смена площадки одобрена.', 'The venue change is approved.') : inLang(org.lang, `Maydonni almashtirish rad etildi. Sabab: ${reason}`, `Смена площадки отклонена. Причина: ${reason}`, `The venue change was declined. Reason: ${reason}`), org.lang, 'org');
    logAct(decision === 'approved' ? 'venue-change-approve' : 'venue-change-return', evTitle(ev), reason || '');
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------- sessions (US-13, US-14, US-16, US-20, US-39, US-40)

/** Creates a session. Cinema sessions copy the hall plan at creation; others use the event's own copy [Р1]. */
export function addSession(d: Db, ev: EventItem, startsAt: number, extra: Partial<Session> = {}): Session {
  const venue = byId(d.venues, ev.venueId);
  const hall = (extra.hallId && venue?.halls.find((h) => h.id === extra.hallId)) || venue?.halls.find((h) => h.id === ev.hallId) || venue?.halls[0];
  let schemeId = ev.schemeId;
  if (ev.kind === 'cinema' && hall) {
    schemeId = uid('sch');
    d.schemes[schemeId] = clone(d.schemes[hall.schemeId]);
  }
  const s: Session = { id: uid('s'), eventId: ev.id, startsAt, doorsAt: null, salesUntil: null, hallId: hall?.id || null, duration: ev.card.duration || 120, schemeId, scheduleId: null, postponed: [], createdAt: now(), ...extra };
  s.hallId = hall?.id || null;
  s.schemeId = schemeId;
  d.sessions.push(s);
  return s;
}
export function sessionSold(sid: string) {
  return (ticketsBySid()[sid] || []).length;
}
export function sessionHasHolds(sid: string) {
  return activeHolds().some((h) => h.sid === sid);
}
/** Cinema: a hall can't host two shows at once; 15 minutes for cleaning between them (US-16). */
export const CLEANING_MIN = 15;
export function hallConflict(hallId: string, startsAt: number, duration: number, exceptId?: string): Session | null {
  const end = startsAt + (duration + CLEANING_MIN) * MIN;
  return (
    getDb().sessions.find((s) => {
      if (s.id === exceptId || s.hallId !== hallId) return false;
      const sEnd = s.startsAt + (s.duration + CLEANING_MIN) * MIN;
      return startsAt < sEnd && s.startsAt < end;
    }) || null
  );
}
/** Dates a weekly schedule produces (US-14). */
export function scheduleDates(days: number[], from: string, to: string) {
  const out: string[] = [];
  for (let x = from; x <= to; x = addDays(x, 1)) if (days.includes(dowOf(x))) out.push(x);
  return out;
}
/** Postpones a concert-like session; tickets stay valid and buyers get an SMS (and email) in their language (US-39, US-40). */
export function postponeSession(sessionId: string, newStart: number, reason: string) {
  return tx((d) => {
    const s = byId(d.sessions, sessionId)!;
    const ev = byId(d.events, s.eventId)!;
    const from = s.startsAt;
    const orders = d.orders.filter((o) => o.sid === s.id);
    let failed = 0;
    for (const o of orders) {
      const T = evTitle(ev, o.lang);
      const when = withLang(o.lang, () => fmtDT(newStart));
      const old = withLang(o.lang, () => fmtDT(from));
      send('sms', o.buyer.phone, '', inLang(o.lang, `Sayohat: ${T} ${when} ga koʻchirildi. Chiptangiz amal qiladi. sayohat.uz/t/${o.id}`, `Sayohat: ${T} перенесён на ${when}. Ваш билет действует. sayohat.uz/t/${o.id}`, `Sayohat: ${T} is moved to ${when}. Your ticket is valid. sayohat.uz/t/${o.id}`), o.lang, 'postpone');
      if (o.buyer.email)
        send('email', o.buyer.email, inLang(o.lang, 'Konsert koʻchirildi', 'Концерт перенесён', 'Concert postponed'), inLang(o.lang, `${T}: ${old} → ${when}. ${reason ? 'Sabab: ' + reason + '. ' : ''}Chipta: sayohat.uz/t/${o.id}`, `${T}: ${old} → ${when}. ${reason ? 'Причина: ' + reason + '. ' : ''}Билет: sayohat.uz/t/${o.id}`, `${T}: ${old} → ${when}. ${reason ? 'Reason: ' + reason + '. ' : ''}Ticket: sayohat.uz/t/${o.id}`), o.lang, 'postpone');
      if (!o.buyer.phone) failed++;
    }
    s.postponed.push({ from, to: newStart, at: now(), reason, notified: orders.length - failed, failed });
    s.startsAt = newStart;
    if (s.doorsAt) s.doorsAt = newStart - (from - s.doorsAt);
    if (s.salesUntil) s.salesUntil = null;
    logAct('postpone', evTitle(ev), `${fmtDT(from)} → ${fmtDT(newStart)}`);
    return { notified: orders.length };
  });
}
/** Upcoming sessions of a published event (storefront). */
export function upcoming(ev: EventItem) {
  return eventSessions(ev.id).filter((s) => (s.salesUntil || s.startsAt) > now());
}
/** Published events that have something on sale (storefront, US-25). */
export function storefrontEvents() {
  return m('front', () =>
    getDb().events.filter((e) => {
      if (e.status !== 'published') return false;
      if (e.kind === 'museum') {
        for (let i = 0; i <= (e.museum?.ahead || 30); i++) if (museumDay(e, addDays(todayKey(), i)).open) return true;
        return false;
      }
      return upcoming(e).length > 0;
    }),
  );
}
export function nextStart(ev: EventItem): number | null {
  if (ev.kind === 'museum') {
    for (let i = 0; i <= (ev.museum?.ahead || 30); i++) {
      const dd = addDays(todayKey(), i);
      const sl = museumSlots(ev, dd).find((s) => !s.past);
      if (sl) return sl.startMs;
    }
    return null;
  }
  return upcoming(ev)[0]?.startsAt ?? null;
}
export function eventCapacity(ev: EventItem) {
  const sc = eventScheme(ev);
  return sc ? capacityOf(sc) : 0;
}

// ---------------------------------------------------------------- reports (US-43)

export type SalesRow = { key: string; ev: EventItem; when: string; sort: number; on: number; box: number; sOn: number; sBox: number; types: Record<string, { n: number; s: number }>; passed: number };
export function salesRows(orgId: string, f: { ev?: string; from?: string; to?: string; ch?: Channel | ''; sid?: string }): SalesRow[] {
  const d = getDb();
  const evs = d.events.filter((e) => e.orgId === orgId && (!f.ev || e.id === f.ev));
  const evIds = new Set(evs.map((e) => e.id));
  const from = f.from ? tkMs(f.from, '00:00') : -Infinity;
  const to = f.to ? tkMs(f.to, '23:59') + MIN : Infinity;
  const tickets = d.tickets.filter((t) => evIds.has(t.ev) && t.at >= from && t.at < to && (!f.ch || t.ch === f.ch) && (!f.sid || t.sid === f.sid));
  const rows: Record<string, SalesRow> = {};
  for (const t of tickets) {
    const p = parseSid(t.sid);
    const key = p.museum ? `md~${p.evId}~${p.date}` : t.sid;
    if (!rows[key]) {
      const ev = getEvent(t.ev)!;
      const u = unitInfo(t.sid);
      rows[key] = { key, ev, when: p.museum ? fmtDate(p.date) : u ? fmtDT(u.startsAt) : '—', sort: p.museum ? tkMs(p.date, '00:00') : u?.startsAt || 0, on: 0, box: 0, sOn: 0, sBox: 0, types: {}, passed: 0 };
    }
    const r = rows[key];
    if (t.ch === 'box') {
      r.box++;
      r.sBox += t.p;
    } else {
      r.on++;
      r.sOn += t.p;
    }
    if (t.tn) {
      const k = tl(t.tn);
      r.types[k] = r.types[k] || { n: 0, s: 0 };
      r.types[k].n++;
      r.types[k].s += t.p;
    }
    if (t.used) r.passed++;
  }
  return Object.values(rows).sort((a, b) => a.sort - b.sort);
}
/** Box office day report: cash and QR sums, sales and reprints (US-43). */
export function boxDay(orgId: string, date: string) {
  const d = getDb();
  const evIds = new Set(d.events.filter((e) => e.orgId === orgId).map((e) => e.id));
  const from = tkMs(date, '00:00');
  const to = from + DAY;
  const orders = d.orders.filter((o) => evIds.has(o.ev) && o.ch === 'box' && o.at >= from && o.at < to);
  return {
    orders,
    cash: sumBy(orders.filter((o) => o.pay.method === 'cash'), (o) => o.total),
    qr: sumBy(orders.filter((o) => o.pay.method === 'qr'), (o) => o.total),
    count: orders.length,
    tickets: sumBy(orders, (o) => o.tickets.length),
    reprints: sumBy(orders, (o) => Math.max(0, o.prints - 1)),
  };
}

// ---------------------------------------------------------------- misc helpers for screens

export const orgEvents = (orgId: string) => getDb().events.filter((e) => e.orgId === orgId);
export const orgVenues = (orgId: string) => getDb().venues.filter((v) => v.orgId === orgId);
export const typeReq = (t: TicketType) => (t.req ? tl(t.req) : '');
export const phoneLabel = fmtPhone;
export const dateOfMs = dateKey;
