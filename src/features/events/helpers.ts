/* Event editor helpers: draft creation, the event's own plan copy, sessions and museum bookkeeping (US-12 … US-24). */
import { getLang, t3, tx3, type L10n } from '../../lib/i18n';
import { addDays, dateKey, DOW_SHORT, hhmm, MIN, now, pad, tk, tkMs, todayKey } from '../../lib/time';
import { byId, clone, uid } from '../../lib/util';
import { getDb, tx } from '../../store/db';
import { activeHolds, evTitle, eventSessions, getVenue, KIND, logAct, parseSid, ticketsBySid } from '../../domain/rules';
import { newScheme, sellables } from '../../domain/scheme';
import type { Db, DayHours, EventItem, EventKind, Session, TicketType, Venue } from '../../domain/types';

// ---------------------------------------------------------------- steps

export type StepKey = 'kind' | 'card' | 'plan' | 'prices' | 'sessions' | 'submit';
export const STEP_KEYS: StepKey[] = ['kind', 'card', 'plan', 'prices', 'sessions', 'submit'];
/** Museums have no seating plan, so they skip the plan step. */
export const stepsOf = (kind: EventKind | null | undefined): StepKey[] => (kind === 'museum' ? STEP_KEYS.filter((s) => s !== 'plan') : STEP_KEYS);
export function stepLabel(k: StepKey, kind?: EventKind | null) {
  switch (k) {
    case 'kind':
      return t3('Turi va maydon', 'Вид и площадка', 'Kind and venue');
    case 'card':
      return t3('Kartochka', 'Карточка', 'Event card');
    case 'plan':
      return t3('Sxema', 'Схема', 'Seating plan');
    case 'prices':
      return kind && KIND[kind].pricing === 'element' ? t3('Narxlar', 'Цены', 'Prices') : t3('Chipta turlari', 'Типы билетов', 'Ticket types');
    case 'sessions':
      return kind === 'museum' ? t3('Grafik', 'График', 'Opening hours') : t3('Seanslar', 'Сеансы', 'Sessions');
    case 'submit':
      return t3('Tekshirish va yuborish', 'Проверка и отправка', 'Check and submit');
  }
}
export const nextStep = (kind: EventKind, k: StepKey): StepKey => {
  const ks = stepsOf(kind);
  return ks[Math.min(ks.length - 1, ks.indexOf(k) + 1)];
};

// ---------------------------------------------------------------- constants

export const AGES = ['0+', '6+', '12+', '16+', '18+'];
export const MOTIFS: { id: string; name: L10n }[] = [
  { id: 'star', name: tx3('Girih yulduz', 'Звезда-гирих', 'Girih star') },
  { id: 'arch', name: tx3('Ravoqlar', 'Арки', 'Arches') },
  { id: 'wave', name: tx3('Toʻlqinlar', 'Волны', 'Waves') },
  { id: 'vase', name: tx3('Koʻza', 'Кувшин', 'Vase') },
  { id: 'film', name: tx3('Plyonka', 'Плёнка', 'Film') },
  { id: 'ball', name: tx3('Toʻp', 'Мяч', 'Ball') },
  { id: 'mic', name: tx3('Mikrofon', 'Микрофон', 'Microphone') },
];
export const KIND_POSTER: Record<EventKind, { hue: number; motif: string }> = {
  concert: { hue: 228, motif: 'mic' },
  theatre: { hue: 280, motif: 'arch' },
  cinema: { hue: 250, motif: 'film' },
  museum: { hue: 196, motif: 'vase' },
  sport: { hue: 140, motif: 'ball' },
  event: { hue: 20, motif: 'star' },
};
export const KIND_HOW: Record<EventKind, L10n> = {
  concert: tx3(
    'Sektorlar, fan-zona va stollar bilan sxema. Bir yoki bir nechta sana, sektorlar boʻyicha narx, koʻchirish mumkin.',
    'Схема с секторами, фан-зоной и столами. Одна или несколько дат, цена по секторам, можно переносить.',
    'A plan with sectors, a fan zone and tables. One or more dates, priced by sector, can be postponed.',
  ),
  theatre: tx3('Oddiy va VIP joyli zal. «Har chorshanba 19:00 da» jadvali, chipta turlari.', 'Зал с обычными и VIP-местами. Расписание «каждую среду в 19:00», типы билетов.', 'A hall with standard and VIP seats. A weekly schedule and ticket types.'),
  cinema: tx3('Turli zallarda film seanslari, har bir seansda oʻz zali sxemasi.', 'Сеансы фильма в разных залах, у каждого сеанса — схема своего зала.', 'Showtimes in different halls; each one uses its hall’s plan.'),
  museum: tx3('Vaqt boʻyicha kirish: ish vaqti, slotlar va odamlar limiti. Fuqarolar va xorijliklar uchun narxlar.', 'Вход по времени: часы работы, слоты и лимит людей. Цены для граждан и иностранцев.', 'Timed entry: opening hours, slots and a people limit. Prices for citizens and foreign visitors.'),
  sport: tx3('Stadion yoki zal sxemasi, tribunalar boʻyicha narx, bir yoki bir nechta oʻyin sanasi.', 'Схема стадиона или зала, цена по трибунам, одна или несколько дат матча.', 'A stadium or arena plan, priced by stand, one or more match dates.'),
  event: tx3('Konferensiya, festival, banket: sektorlar, fan-zona yoki stollar, sanalar boʻyicha.', 'Конференция, фестиваль, банкет: секторы, фан-зона или столы, по датам.', 'Conference, festival, banquet: sectors, a fan zone or tables, by date.'),
};
export const PASSPORT: Record<TicketType['passport'], L10n> = {
  citizen: tx3('Oʻzbekiston fuqarolari', 'Граждане Узбекистана', 'Citizens of Uzbekistan'),
  foreigner: tx3('Xorijiy fuqarolar', 'Иностранцы', 'Foreign visitors'),
  none: tx3('Pasportsiz', 'Без паспорта', 'No passport'),
};
export const SLOT_LENGTHS = [30, 60, 120];
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const daysText = (days: number[]) =>
  DOW_ORDER.filter((x) => days.includes(x))
    .map((x) => DOW_SHORT[getLang()][x])
    .join(', ');
export const TIME_RE = /^\d{2}:\d{2}$/;
export const empty3 = (): L10n => ({ uz: '', ru: '', en: '' });
export const has3 = (v: L10n | null | undefined) => !!v && !!(v.uz.trim() || v.ru.trim() || v.en.trim());
export const trim3 = (v: L10n): L10n => ({ uz: v.uz.trim(), ru: v.ru.trim(), en: v.en.trim() });

export function defaultHours(): Record<number, DayHours> {
  const h: Record<number, DayHours> = {};
  for (let i = 0; i < 7; i++) h[i] = { open: '09:00', close: '18:00', off: i === 1 };
  return h;
}
export function adultType(kind: EventKind, order = 0): TicketType {
  return {
    id: uid('ty'),
    name: tx3('Kattalar', 'Взрослый', 'Adult'),
    prices: kind === 'museum' ? undefined : {},
    price: kind === 'museum' ? 0 : undefined,
    req: null,
    passport: kind === 'museum' ? 'citizen' : 'none',
    hidden: false,
    order,
  };
}

// ---------------------------------------------------------------- venues and the event's plan copy

/** Venues a kind can use: museums need timed entry; cinema needs at least one hall; the others a seating plan. */
export function venueFits(kind: EventKind, v: Venue) {
  if (kind === 'museum') return v.type === 'timed';
  return v.type === 'scheme' && v.halls.length > 0;
}
export const hasOwnPlan = (kind: EventKind) => kind !== 'cinema' && kind !== 'museum';

/**
 * Gives the event its own copy of a hall plan of the venue [Р1]: the chosen layout (an arena has a concert, a UFC,
 * a hockey layout…), else the one used before, else the first hall. Removes the previous copy.
 */
function copyPlan(d: Db, ev: EventItem, venue: Venue, hallId?: string | null) {
  if (!hasOwnPlan(ev.kind)) return;
  const old = ev.schemeId;
  const hall = venue.halls.find((h) => h.id === (hallId ?? ev.hallId)) || venue.halls.slice().sort((a, b) => a.order - b.order)[0];
  ev.hallId = hall?.id || null;
  const sid = uid('sch');
  d.schemes[sid] = clone((hall && d.schemes[hall.schemeId]) || newScheme());
  ev.schemeId = sid;
  for (const s of d.sessions.filter((x) => x.eventId === ev.id)) {
    s.schemeId = sid;
    s.hallId = hall?.id || null;
  }
  if (old && old !== sid && !d.sessions.some((s) => s.schemeId === old)) delete d.schemes[old];
}
/** Element prices survive a re-copy for elements with the same name and type. */
function carryPrices(d: Db, ev: EventItem, oldSchemeId: string | null) {
  const oldSc = oldSchemeId ? d.schemes[oldSchemeId] : undefined;
  const sc = ev.schemeId ? d.schemes[ev.schemeId] : undefined;
  const prices: EventItem['prices'] = { els: {}, tables: {} };
  if (oldSc && sc) {
    for (const el of sellables(sc)) {
      const o = sellables(oldSc).find((x) => x.name === el.name && x.type === el.type);
      if (!o) continue;
      if (ev.prices.els[o.id]) prices.els[el.id] = ev.prices.els[o.id];
      if (ev.prices.tables[o.id]) prices.tables[el.id] = { ...ev.prices.tables[o.id] };
      if (ev.prices.rows?.[o.id]) (prices.rows ||= {})[el.id] = ev.prices.rows[o.id].map((t) => ({ ...t }));
    }
  }
  ev.prices = prices;
}

export function createDraft(orgId: string, kind: EventKind, venueId: string, hallId?: string | null): EventItem {
  return tx((d) => {
    const v = byId(d.venues, venueId)!;
    const e: EventItem = {
      id: uid('ev_'),
      orgId,
      kind,
      venueId: v.id,
      status: 'draft',
      card: { title: empty3(), desc: empty3(), duration: kind === 'cinema' ? 110 : kind === 'museum' ? 60 : 120, age: '', poster: { hue: Math.floor(Math.random() * 360), motif: KIND_POSTER[kind].motif, image: null }, lang: '' },
      schemeId: null,
      prices: { els: {}, tables: {} },
      types: KIND[kind].pricing === 'element' ? [] : [adultType(kind)],
      museum: kind === 'museum' ? { hours: defaultHours(), slot: 60, limit: 50, ahead: 30, offDays: [], overrides: {} } : null,
      schedules: [],
      createdAt: now(),
      submittedAt: null,
      firstPublishedAt: null,
      history: [],
      resubmitted: false,
      venueChange: null,
      vcHistory: [],
    };
    copyPlan(d, e, v, hallId);
    d.events.push(e);
    logAct('event-create', `${t3('Yangi tadbir', 'Новое мероприятие', 'New event')} · ${v.name}`, kind);
    return e;
  });
}

/** Venue of a draft changes at once (with a fresh plan copy); a published event goes through moderation (US-23). */
export function changeDraftVenue(evId: string, venueId: string, hallId?: string | null): { ok: boolean; reason?: string } {
  const ev = byId(getDb().events, evId)!;
  if (ev.kind === 'cinema' && eventSessions(ev.id).length)
    return { ok: false, reason: t3('Avval seanslarni oʻchiring — ular joriy maydon zallariga bogʻlangan', 'Сначала удалите сеансы — они привязаны к залам текущей площадки', 'Delete the sessions first: they belong to the current venue’s halls') };
  tx((d) => {
    const e = byId(d.events, evId)!;
    const nv = byId(d.venues, venueId)!;
    const old = e.schemeId;
    const from = getVenue(e.venueId)?.name || '—';
    const from_id = e.venueId;
    e.venueId = nv.id;
    if (hasOwnPlan(e.kind)) {
      copyPlan(d, e, nv, hallId ?? (nv.id === from_id ? e.hallId : null));
      carryPrices(d, e, old);
    }
    logAct('event-update', evTitle(e), t3('maydon: {a} → {b}', 'площадка: {a} → {b}', 'venue: {a} → {b}', { a: from, b: nv.name }));
  });
  return { ok: true };
}

export const eventTickets = (evId: string) => getDb().tickets.filter((t) => t.ev === evId);
export const eventHasHolds = (evId: string) => {
  const ids = new Set(eventSessions(evId).map((s) => s.id));
  return activeHolds().some((h) => ids.has(h.sid) || h.sid.startsWith(`m~${evId}~`));
};
/** The plan copy can be taken again from the venue only while nothing is sold or held. */
export const canRecopy = (ev: EventItem) => !eventTickets(ev.id).length && !eventHasHolds(ev.id);
export function recopyPlan(evId: string) {
  tx((d) => {
    const e = byId(d.events, evId)!;
    const v = byId(d.venues, e.venueId)!;
    const old = e.schemeId;
    copyPlan(d, e, v);
    carryPrices(d, e, old);
    logAct('event-update', evTitle(e), t3('sxema maydondan qayta nusxalandi', 'схема скопирована с площадки заново', 'plan copied from the venue again'));
  });
}
/** Most tickets sold (and held) in a fan zone across the sessions: its limit can't go below this. */
export function zoneSoldMax(ev: EventItem, elId: string) {
  const tbs = ticketsBySid();
  const holds = activeHolds();
  let max = 0;
  for (const s of eventSessions(ev.id)) {
    let n = (tbs[s.id] || []).filter((t) => t.el === elId).length;
    for (const h of holds) if (h.sid === s.id) for (const it of h.items) if (it.k === 'zone' && it.elId === elId) n += it.qty;
    max = Math.max(max, n);
  }
  return max;
}

/** Drafts that never went live and have no sales can be deleted (US-12 rule 5). */
export function canDeleteEvent(ev: EventItem) {
  return (ev.status === 'draft' || ev.status === 'rework') && !ev.firstPublishedAt && !eventTickets(ev.id).length;
}
export function deleteEvent(evId: string) {
  tx((d) => {
    const e = byId(d.events, evId);
    if (!e) return;
    const sess = d.sessions.filter((s) => s.eventId === evId);
    const sids = new Set(sess.map((s) => s.id));
    for (const s of sess) if (s.schemeId && s.schemeId !== e.schemeId) delete d.schemes[s.schemeId];
    if (e.schemeId) delete d.schemes[e.schemeId];
    d.sessions = d.sessions.filter((s) => s.eventId !== evId);
    d.holds = d.holds.filter((h) => !sids.has(h.sid) && !h.sid.startsWith(`m~${evId}~`));
    d.events = d.events.filter((x) => x.id !== evId);
    logAct('event-delete', evTitle(e), '');
  });
}

// ---------------------------------------------------------------- sessions

export const sessEnd = (s: Session) => s.startsAt + (s.duration || 120) * MIN;
export type DelState = 'ok' | 'sold' | 'held';
export function delState(sid: string): DelState {
  if ((ticketsBySid()[sid] || []).length) return 'sold';
  if (activeHolds().some((h) => h.sid === sid)) return 'held';
  return 'ok';
}
export const delHint = (st: DelState) =>
  st === 'sold'
    ? t3('Sotilgan chiptalar bor. Sotuvi bor seansni bekor qilish hozircha mavjud emas', 'Есть проданные билеты. Отмена с продажами пока недоступна', 'Tickets have been sold. Cancelling a session with sales isn’t available yet')
    : t3('Xarid davom etmoqda, 10 daqiqadan keyin urinib koʻring', 'Идёт покупка, попробуйте через 10 минут', 'Someone is paying right now, try again in 10 minutes');
/** Deletes a session without sales and holds (US-20). Re-checks inside the transaction. */
export function deleteSession(sid: string): DelState | 'gone' {
  return tx((d) => {
    const s = byId(d.sessions, sid);
    if (!s) return 'gone' as const;
    const st = delState(sid);
    if (st !== 'ok') return st;
    const e = byId(d.events, s.eventId)!;
    d.sessions = d.sessions.filter((x) => x.id !== sid);
    if (s.schemeId && s.schemeId !== e.schemeId && !d.sessions.some((x) => x.schemeId === s.schemeId)) delete d.schemes[s.schemeId];
    const v = byId(d.venues, e.venueId);
    const hall = v && v.halls.length > 1 ? v.halls.find((h) => h.id === s.hallId)?.name : '';
    logAct('session-delete', evTitle(e), `${fmtStampTk(s.startsAt)}${hall ? ' · ' + hall : ''}`);
    return 'ok' as const;
  });
}
/** Sessions of any event in the same hall that overlap [start, start + dur), with `gap` minutes of cleaning on both sides. */
export function hallOverlaps(hallId: string | null, start: number, dur: number, exceptId?: string | null, gap = 0): Session[] {
  if (!hallId) return [];
  const g = gap * MIN;
  const end = start + dur * MIN;
  return getDb()
    .sessions.filter((s) => s.hallId === hallId && s.id !== exceptId && start < sessEnd(s) + g && s.startsAt < end + g)
    .sort((a, b) => a.startsAt - b.startsAt);
}
export const overlapText = (list: Session[]) =>
  list
    .map((s) => {
      const e = byId(getDb().events, s.eventId);
      return `«${e ? evTitle(e) : '—'}» ${fmtStampTk(s.startsAt)}–${hhmm(sessEnd(s))}`;
    })
    .join('; ');
export const ordersOf = (sid: string) => getDb().orders.filter((o) => o.sid === sid);
/** Moves one session to another start, shifting doors and sales close with it. */
export function moveSessionStart(s: Session, start: number) {
  const shift = start - s.startsAt;
  s.startsAt = start;
  if (s.doorsAt) s.doorsAt += shift;
  if (s.salesUntil) s.salesUntil += shift;
}

// ---------------------------------------------------------------- museum

export function museumSoldBySid(evId: string, fromDate = todayKey()) {
  const out: Record<string, number> = {};
  for (const t of getDb().tickets) {
    if (t.ev !== evId || t.k !== 'slot') continue;
    const p = parseSid(t.sid);
    if (p.museum && p.date >= fromDate) out[t.sid] = (out[t.sid] || 0) + 1;
  }
  return out;
}
export function museumSoldOn(evId: string, date: string) {
  return getDb().tickets.filter((t) => t.ev === evId && t.k === 'slot' && t.sid.startsWith(`m~${evId}~${date}~`)).length;
}
export const museumHeldOn = (evId: string, date: string) => activeHolds().some((h) => h.sid.startsWith(`m~${evId}~${date}~`));
export const sameDayCfg = (a: { h: DayHours | undefined; slot: number }, b: { h: DayHours | undefined; slot: number }) =>
  a.slot === b.slot && !!a.h === !!b.h && (!a.h || (a.h.off === b.h!.off && (a.h.off || (a.h.open === b.h!.open && a.h.close === b.h!.close))));

// ---------------------------------------------------------------- time inputs

/** 'YYYY-MM-DDTHH:MM' from a datetime-local input, in Tashkent time. */
export function parseLocalDT(v: string): number | null {
  if (!v || !v.includes('T')) return null;
  const [d, t] = v.split('T');
  return TIME_RE.test(t.slice(0, 5)) ? tkMs(d, t.slice(0, 5)) : null;
}
export const toLocalDT = (ms: number) => `${dateKey(ms)}T${hhmm(ms)}`;
export function fmtStampTk(ms: number) {
  const p = tk(ms);
  return `${pad(p.d)}.${pad(p.m)}.${p.y} ${pad(p.hh)}:${pad(p.mi)}`;
}
export function dateErr(date: string) {
  if (!date) return t3('Sanani kiriting', 'Укажите дату', 'Enter the date');
  if (date < todayKey()) return t3('Sana oʻtib ketgan', 'Дата уже прошла', 'This date has passed');
  return '';
}
export const timeErr = (t: string) => (TIME_RE.test(t || '') ? '' : t3('Vaqtni kiriting', 'Укажите время', 'Enter the time'));
export const maxScheduleEnd = (from: string) => addDays(from, 365);

// ---------------------------------------------------------------- poster upload

/** Reads an image and downscales it to at most 900 px wide JPEG, so the local database stays small. */
export function readPoster(file: File, maxW = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('type'));
      return;
    }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('read'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const k = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas'));
          return;
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

export const STATUS_TONE: Record<EventItem['status'], 'neutral' | 'warn' | 'ok' | 'bad'> = { draft: 'neutral', moderation: 'warn', published: 'ok', rework: 'bad' };
