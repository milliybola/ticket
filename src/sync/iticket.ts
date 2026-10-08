/*
 * One source of truth: the catalogue of iticket.uz is imported into the local backend, so the storefront, the
 * organizer cabinet, the box office and the moderator all work with the same events.
 *
 *  - syncCatalog(): organizers (iticket "ou"), venues, events and their upcoming sessions — about 150 events,
 *    a few seconds. Event names come in uz/ru/en.
 *  - ensurePlan(session): the seating plan of one session, loaded the first time someone needs it (buyer, cashier,
 *    organizer, moderator): the SVG plan with its sectors and seats, price categories and ticket types, and which
 *    seats are still free on iticket. Taken seats stay taken here too.
 *
 * Purchases made here stay in this browser (localStorage). All local data lives one day, then it is cleared and
 * the catalogue is imported again (see LOCAL_TTL).
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { itCdn, itGet, type ItEvent, type ItEventShort, type ItEventsResponse, type ItManifest, type ItSeat, type ItSector, type ItSession, type ItVenue } from '../api/iticket';
import { tx3, type L10n, type Lang } from '../lib/i18n';
import { DAY, now, parseApiDate } from '../lib/time';
import { clone, safeLS } from '../lib/util';
import { getDb, initDb, tx } from '../store/db';
import { defaultCats, fitBox, importSvg, newStage, ROW_GAP, SEAT_GAP } from '../domain/scheme';
import { eventSessions, getSession } from '../domain/rules';
import type { EventItem, EventKind, Org, Scheme, SchemeEl, SeatCat, Session, TicketType, Venue } from '../domain/types';

/** Everything the app keeps in localStorage lives this long. */
export const LOCAL_TTL = DAY;
/** Upcoming sessions kept per event (iticket lists long series of daily sessions). */
const MAX_SESSIONS = 40;
const CONCURRENCY = 16;

export const extEventId = (id: number) => `it-e${id}`;
const extVenueId = (id: number) => `it-v${id}`;
const extHallId = (id: number) => `it-h${id}`;
const extOrgId = (ou: number) => `it-o${ou}`;
const extSessionId = (id: number) => `it-s${id}`;

const KIND_BY_CATEGORY: Record<string, EventKind> = { concerts: 'concert', 'theaters-tashkent': 'theatre', sport: 'sport' };

function cityOf(...texts: (string | null | undefined)[]) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  if (/samarq|самарк|samark/.test(t)) return 'samarkand';
  if (/buxor|бухар|bukhar/.test(t)) return 'bukhara';
  if (/xiva|хива|khiva/.test(t)) return 'khiva';
  if (/fargʻon|fargona|фергана|fergana/.test(t)) return 'fergana';
  if (/namangan|наманган/.test(t)) return 'namangan';
  if (/andijon|андижан/.test(t)) return 'andijan';
  return 'tashkent';
}
/** Event descriptions are HTML on iticket; the event card keeps plain text with line breaks. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n')}</div>`, 'text/html');
  return (doc.body.textContent || '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000);
}
const noImg = (u: string | null | undefined) => !u || /no-poster|no-cover|no-slide|no-icon/.test(u);

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>, onDone?: () => void): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try {
        out[k] = await fn(items[k]);
      } catch {
        out[k] = null;
      }
      onDone?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function allEvents(lang: Lang): Promise<ItEventShort[]> {
  const out: ItEventShort[] = [];
  for (let page = 1; page < 40; page++) {
    const r = await itGet<ItEventsResponse>(lang, '/events', { page });
    out.push(...r.events.data);
    if (!r.events.next_page_url) break;
  }
  return out;
}

// ---------------------------------------------------------------- sync state (for the loading screen)

type SyncState = { status: 'idle' | 'syncing' | 'ready' | 'error'; stage: string; done: number; total: number; error: string };
export const useSync = create<SyncState>(() => ({ status: 'idle', stage: '', done: 0, total: 0, error: '' }));
const setSync = (p: Partial<SyncState>) => useSync.setState(p);

let running: Promise<void> | null = null;

/** Imports the iticket catalogue into the local backend, replacing the previous import. */
export function syncCatalog(): Promise<void> {
  if (running) return running;
  running = (async () => {
    setSync({ status: 'syncing', stage: 'list', done: 0, total: 0, error: '' });
    try {
      const [uz, ru, en] = await Promise.all([allEvents('uz'), allEvents('ru'), allEvents('en')]);
      const names = (id: number): L10n => {
        const u = uz.find((e) => e.id === id)?.name || '';
        return tx3(u, ru.find((e) => e.id === id)?.name || u, en.find((e) => e.id === id)?.name || u);
      };
      const list = uz.filter((e) => !e.external_url);
      setSync({ stage: 'details', total: list.length, done: 0 });
      let done = 0;
      const details = await pool(
        list,
        CONCURRENCY,
        (e) => itGet<ItEvent>('uz', `/events/${e.category_slug}/${e.slug}`),
        () => setSync({ done: ++done }),
      );
      setSync({ stage: 'save' });
      tx((d) => {
        // replace the previous import, keep what organizers created here
        const isExt = (id: string) => id.startsWith('it-');
        const oldSchemes = new Set([...d.venues.filter((v) => isExt(v.id)).flatMap((v) => v.halls.map((h) => h.schemeId)), ...d.sessions.filter((s) => isExt(s.id)).map((s) => s.schemeId || ''), ...d.events.filter((e) => isExt(e.id)).map((e) => e.schemeId || '')]);
        for (const sid of oldSchemes) delete d.schemes[sid];
        d.orgs = d.orgs.filter((o) => !isExt(o.id));
        d.venues = d.venues.filter((v) => !isExt(v.id));
        d.events = d.events.filter((e) => !isExt(e.id));
        d.sessions = d.sessions.filter((s) => !isExt(s.id));
        const t = now();
        const orgs = new Map<number, Org>();
        const venueOwner = new Map<number, string>();
        const venues = new Map<number, Venue>();
        const orgVenueNames = new Map<number, string[]>();
        const addVenue = (v: ItVenue | ItEvent['venues'][number], ownerOrg: string, category: string) => {
          if (venues.has(v.id)) return venues.get(v.id)!;
          const sid = `it-sch-h${v.id}`;
          d.schemes[sid] = { w: 1000, h: 640, cats: defaultCats(), els: [] };
          const lat = parseFloat(String(v.map_lat || ''));
          const lng = parseFloat(String(v.map_lng || ''));
          const nv: Venue = {
            id: extVenueId(v.id),
            ext: { id: v.id },
            orgId: ownerOrg,
            name: v.name,
            city: cityOf(v.name, v.address, category === 'samarkand' ? 'samarqand' : ''),
            address: v.address || '',
            point: isFinite(lat) && isFinite(lng) && lat && lng ? { lat, lng } : null,
            type: 'scheme',
            halls: [{ id: extHallId(v.id), name: 'Asosiy zal', order: 0, schemeId: sid }],
            createdAt: t,
            createdBy: 'org',
          };
          venues.set(v.id, nv);
          venueOwner.set(v.id, ownerOrg);
          d.venues.push(nv);
          return nv;
        };
        details.forEach((x, i) => {
          if (!x) return;
          const short = list[i];
          const ou = x.ou_id || 0;
          if (!orgs.has(ou)) {
            const o: Org = {
              id: extOrgId(ou),
              ext: { id: ou },
              name: '',
              kinds: [],
              contact: 'iticket.uz',
              phone: '+99871200' + String(1000 + (ou % 9000)).padStart(4, '0'),
              email: `ou${ou}@iticket.uz`,
              password: 'demo1234',
              lang: 'uz',
              status: 'approved',
              createdAt: t,
              submittedAt: t,
              resubmitted: false,
              changed: [],
              history: [
                { at: t, by: '', decision: 'submitted', reason: '' },
                { at: t, by: 'iticket.uz', decision: 'approved', reason: '' },
              ],
            };
            orgs.set(ou, o);
            orgVenueNames.set(ou, []);
            d.orgs.push(o);
          }
          const org = orgs.get(ou)!;
          const kind = KIND_BY_CATEGORY[short.category_slug] || 'event';
          if (!org.kinds.includes(kind)) org.kinds.push(kind);
          const sessions = (x.sessions || [])
            .filter((s) => parseApiDate(s.sell_ends_at) > t || parseApiDate(s.session_starts_at) > t)
            .sort((a, b) => parseApiDate(a.session_starts_at) - parseApiDate(b.session_starts_at))
            .slice(0, MAX_SESSIONS);
          const mainVenue = sessions[0]?.venue || x.venues?.[0];
          if (!mainVenue) return;
          for (const s of sessions) addVenue(s.venue, venueOwner.get(s.venue.id) || org.id, short.category_slug);
          const v = addVenue(mainVenue, org.id, short.category_slug);
          orgVenueNames.get(ou)!.push(v.name);
          const first = sessions[0];
          const dur = first ? Math.round((parseApiDate(first.session_ends_at) - parseApiDate(first.session_starts_at)) / 60000) : 120;
          const desc = htmlToText(x.description);
          const ev: EventItem = {
            id: extEventId(x.id),
            ext: { id: x.id, category: short.category_slug, slug: x.slug },
            extMinPrice: x.min_price || short.min_price || null,
            orgId: org.id,
            kind,
            venueId: v.id,
            hallId: v.halls[0].id,
            status: 'published',
            card: {
              title: names(x.id),
              desc: tx3(desc, desc, desc),
              duration: dur > 0 && dur <= 600 ? dur : 120,
              age: x.age_limit || '',
              poster: { hue: x.id % 360, motif: 'star', image: noImg(x.poster_url) ? null : x.poster_url, bg: noImg(x.poster_bg_url) ? null : x.poster_bg_url || null },
            },
            schemeId: null,
            prices: { els: {}, tables: {}, rows: {}, cats: {} },
            types: [],
            museum: null,
            schedules: [],
            createdAt: t,
            submittedAt: t,
            firstPublishedAt: t,
            history: [
              { at: t, by: '', decision: 'submitted', reason: '' },
              { at: t, by: 'iticket.uz', decision: 'approved', reason: '' },
            ],
            resubmitted: false,
            venueChange: null,
            vcHistory: [],
          };
          d.events.push(ev);
          for (const s of sessions) d.sessions.push(toSession(s, ev, t));
        });
        // an organizer is named after the venue it sells most at
        for (const [ou, o] of orgs) {
          const ns = orgVenueNames.get(ou) || [];
          const top = ns.sort((a, b) => ns.filter((x) => x === b).length - ns.filter((x) => x === a).length)[0];
          o.name = top ? `${top} (iticket)` : `iticket #${ou}`;
        }
        d.syncedAt = t;
      });
      setSync({ status: 'ready', stage: '' });
    } catch (e) {
      setSync({ status: 'error', error: String((e as Error)?.message || e) });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

function toSession(s: ItSession, ev: EventItem, t: number): Session {
  const start = parseApiDate(s.session_starts_at);
  const end = parseApiDate(s.session_ends_at);
  const sellEnd = parseApiDate(s.sell_ends_at);
  return {
    id: extSessionId(s.id),
    extId: s.id,
    extAvail: null,
    extLoadedAt: null,
    extFree: s.available_tickets_count ?? null,
    eventId: ev.id,
    startsAt: start,
    doorsAt: null,
    // long-running sessions (museums, attractions) started long ago and sell until their end
    salesUntil: isFinite(sellEnd) ? sellEnd : null,
    hallId: extHallId(s.venue_id),
    duration: isFinite(end - start) && end > start ? Math.min(Math.round((end - start) / 60000), 60 * 24 * 400) : ev.card.duration,
    schemeId: null,
    scheduleId: null,
    postponed: [],
    createdAt: t,
  };
}

// ---------------------------------------------------------------- one session's plan

const inflight = new Map<string, Promise<void>>();

/** Loads the plan, prices and free seats of an imported session (once). Local sessions resolve at once. */
export function ensurePlan(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return Promise.resolve();
  const s = getSession(sessionId);
  if (!s?.extId || s.schemeId) return Promise.resolve();
  if (inflight.has(sessionId)) return inflight.get(sessionId)!;
  const p = (async () => {
    const man = await itGet<ItManifest>('uz', `/manifest/config/${s.extId}`);
    let seats: ItSeat[] = man.seats && !Array.isArray(man.seats) ? Object.values(man.seats).flat() : [];
    const legends = [...man.legends];
    const variations = [...man.variations];
    const sectors: ItSector[] = man.sectors || [];
    // sector-based plans list their seats in one manifest per sector
    if (!seats.length && sectors.some((x) => !x.is_ga)) {
      const per = await pool(
        sectors.filter((x) => !x.is_ga),
        4,
        (sec) => itGet<ItManifest>('uz', `/manifest/config/${s.extId}/${sec.id}`),
      );
      for (const m of per) {
        if (!m) continue;
        if (m.seats && !Array.isArray(m.seats)) seats = seats.concat(Object.values(m.seats).flat());
        for (const l of m.legends || []) if (!legends.some((x) => x.price_category_id === l.price_category_id)) legends.push(l);
        for (const v of m.variations || []) if (!variations.some((x) => x.price_category_id === v.price_category_id && x.buyer_type_id === v.buyer_type_id)) variations.push(v);
      }
    }
    let svgText: string | null = null;
    if (man.options.svg_url && seats.length) {
      try {
        const r = await fetch(itCdn(man.options.svg_url));
        if (r.ok) svgText = await r.text();
      } catch {
        svgText = null;
      }
    }
    const plan = buildPlan({ ...man, legends, variations, sectors }, seats, svgText);
    tx((d) => {
      const ss = d.sessions.find((x) => x.id === sessionId);
      if (!ss || ss.schemeId) return;
      const ev = d.events.find((e) => e.id === ss.eventId);
      if (!ev) return;
      const schId = `it-sch-s${ss.extId}`;
      d.schemes[schId] = plan.scheme;
      ss.schemeId = schId;
      ss.extAvail = plan.avail;
      ss.extLoadedAt = now();
      if (!ev.schemeId) ev.schemeId = schId;
      // the venue hall gets the plan too, so the organizer sees it under Venues
      const venue = d.venues.find((v) => v.halls.some((h) => h.id === ss.hallId));
      const hall = venue?.halls.find((h) => h.id === ss.hallId);
      if (hall && !(d.schemes[hall.schemeId]?.els.length)) d.schemes[hall.schemeId] = clone(plan.scheme);
      // prices: by category (concert-like) or ticket types × category (theatre)
      ev.prices.cats = { ...(ev.prices.cats || {}), ...plan.catPrices };
      for (const ty of plan.types) {
        const old = ev.types.find((x) => x.id === ty.id);
        if (old) old.prices = { ...(old.prices || {}), ...ty.prices };
        else ev.types.push({ ...ty, order: ev.types.length });
      }
    });
  })().finally(() => inflight.delete(sessionId));
  inflight.set(sessionId, p);
  return p;
}

type Built = { scheme: Scheme; avail: string[]; catPrices: Record<string, number>; types: TicketType[] };

const catId = (pc: number) => `pc${pc}`;

/** Turns an iticket manifest (+ its SVG plan) into a local plan: sectors, seats, standing zones, categories. */
export function buildPlan(man: ItManifest, seats: ItSeat[], svgText: string | null): Built {
  const cats: SeatCat[] = man.legends.map((l) => ({ id: catId(l.price_category_id), name: tx3(l.price_category_name, l.price_category_name, l.price_category_name), color: l.color?.bg_color || '#3D7DD8' }));
  for (const v of man.variations) if (!cats.some((c) => c.id === catId(v.price_category_id))) cats.push({ id: catId(v.price_category_id), name: tx3(v.price_category_name, v.price_category_name, v.price_category_name), color: '#5B6B8C' });
  if (!cats.length) cats.push(...defaultCats());
  const catPrices: Record<string, number> = {};
  for (const l of man.legends) if (l.price > 0) catPrices[catId(l.price_category_id)] = Math.min(catPrices[catId(l.price_category_id)] || Infinity, l.price);
  for (const v of man.variations) if (v.price > 0 && !catPrices[catId(v.price_category_id)]) catPrices[catId(v.price_category_id)] = v.price;
  const types = new Map<number, TicketType>();
  for (const v of man.variations) {
    if (!types.has(v.buyer_type_id)) types.set(v.buyer_type_id, { id: `bt${v.buyer_type_id}`, name: tx3(v.buyer_type_name, v.buyer_type_name, v.buyer_type_name), prices: {}, req: null, passport: 'none', hidden: false, order: types.size });
    if (v.price > 0) types.get(v.buyer_type_id)!.prices![catId(v.price_category_id)] = v.price;
  }
  const sectors = man.sectors || [];
  let sc: Scheme | null = null;
  // 1) the real geometry from the SVG plan
  if (svgText) {
    try {
      const imp = importSvg(svgText);
      imp.els = imp.els.filter((e) => e.type !== 'unknown' && !(e.type === 'fan' && e.extId && sectors.find((x) => String(x.id) === e.extId)?.is_ga));
      if (imp.els.some((e) => (e.type === 'seats' || e.type === 'lounge') && e.pts?.length)) sc = imp;
    } catch {
      sc = null;
    }
  }
  const fromSvg = !!sc;
  // 2) no usable SVG: lay the sectors out as grids from the seat list
  if (!sc && seats.length) sc = gridFromSeats(seats, sectors);
  if (!sc) sc = { w: 1000, h: 640, cats: [], els: [] };
  sc.cats = cats;
  const byExt = new Map(sc.els.filter((e) => e.extId).map((e) => [e.extId!, e]));
  const avail: string[] = [];
  const catCount = new Map<string, Map<string, number>>();
  for (const st of seats) {
    const el = byExt.get(String(st.sector_id));
    if (!el) continue;
    const row = /^\d+$/.test(st.row_label) ? String(Number(st.row_label)) : st.row_label;
    const n = Number(st.seat_label);
    const id = `${row}|${n}`;
    if (st.ticket) {
      const c = catId(st.ticket.price_category_id);
      (el.seatCat ||= {})[id] = c;
      avail.push(`${el.id}|${id}`);
      const m = catCount.get(el.id) || new Map<string, number>();
      m.set(c, (m.get(c) || 0) + 1);
      catCount.set(el.id, m);
    }
  }
  for (const el of sc.els) {
    if (el.type !== 'seats' && el.type !== 'lounge') continue;
    const sec = sectors.find((x) => String(x.id) === el.extId);
    if (sec?.name) el.name = sec.name;
    const m = catCount.get(el.id);
    el.cat = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : cats[0].id;
    // seats of the element's own category need no per-seat entry
    for (const [k, v] of Object.entries(el.seatCat || {})) if (v === el.cat) delete el.seatCat![k];
    el.rev++;
  }
  // 3) standing / free-seating sectors become one zone per price category
  const ga = sectors.filter((x) => x.is_ga || man.options.only_ga);
  if (ga.length) {
    const fb = sc.els.length ? fitBox(sc, 0) : { x: 0, y: 80, w: 0, h: 0 };
    let x = fb.x;
    const y = sc.els.length ? fb.y + fb.h + 40 : 100;
    for (const sec of ga) {
      const pcs = [...new Set((sec.variations.length ? sec.variations : man.variations).map((v) => v.price_category_id))];
      for (const pc of pcs) {
        const left = sec.available && typeof sec.available === 'object' ? sec.available[String(pc)] || 0 : sec.variations.find((v) => v.price_category_id === pc)?.available || 0;
        const name = pcs.length > 1 ? `${sec.name} · ${cats.find((c) => c.id === catId(pc))?.name.uz || pc}` : sec.name;
        sc.els.push({ id: `el-ga-${sec.id}-${pc}`, type: 'fan', name, x, y, w: 240, h: 120, rot: 0, limit: Math.max(0, left), cat: catId(pc), src: 'svg', rev: 1, extId: String(sec.id) });
        x += 270;
      }
    }
  }
  // a stage mark only for plans we laid out ourselves: an SVG plan draws its own stage where it really is
  if (!fromSvg && !sc.els.some((e) => e.type === 'stage')) {
    const fb = fitBox(sc, 0);
    const st = newStage('Sahna');
    st.w = Math.max(200, Math.min(500, fb.w * 0.5));
    st.h = Math.max(30, Math.min(70, fb.h * 0.08));
    st.x = fb.x + fb.w / 2 - st.w / 2;
    st.y = fb.y - st.h - 30;
    sc.els.unshift(st);
  }
  return { scheme: sc, avail, catPrices, types: [...types.values()].filter((t) => Object.keys(t.prices || {}).length) };
}

/** Sectors as plain grids (row by row, seats in order), side by side — when the session has no SVG plan. */
function gridFromSeats(seats: ItSeat[], sectors: ItSector[]): Scheme {
  const bySector = new Map<number, ItSeat[]>();
  for (const st of seats) (bySector.get(st.sector_id) || bySector.set(st.sector_id, []).get(st.sector_id)!).push(st);
  const els: SchemeEl[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let col = 0;
  for (const [secId, list] of bySector) {
    const rows = [...new Set(list.map((s) => s.row_label))].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b));
    const pts = list.map((s) => {
      const ri = rows.indexOf(s.row_label);
      const inRow = list.filter((o) => o.row_label === s.row_label).sort((a, b) => Number(a.seat_label) - Number(b.seat_label));
      const ci = inRow.indexOf(s);
      return { r: /^\d+$/.test(s.row_label) ? Number(s.row_label) : s.row_label, n: Number(s.seat_label), x: x + ci * SEAT_GAP, y: y + ri * ROW_GAP };
    });
    const w = Math.max(...pts.map((p) => p.x)) - x;
    const h = Math.max(...pts.map((p) => p.y)) - y;
    els.push({ id: `el-s${secId}`, type: 'seats', name: sectors.find((s) => s.id === secId)?.name || String(secId), x: 0, y: 0, rot: 0, src: 'svg', rev: 1, pts, removed: [], seatCat: {}, extId: String(secId) });
    rowH = Math.max(rowH, h);
    x += w + 70;
    if (++col % 3 === 0) {
      x = 0;
      y += rowH + 70;
      rowH = 0;
    }
  }
  return { w: 1000, h: 640, cats: [], els };
}

// ---------------------------------------------------------------- React hooks

/** Loads the plan of a session when a screen needs it. */
export function useEnsurePlan(sessionId: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; error: string }>({ loading: false, error: '' });
  const s = sessionId ? getSession(sessionId) : undefined;
  const need = !!s?.extId && !s.schemeId;
  useEffect(() => {
    if (!need || !sessionId) return;
    let alive = true;
    setState({ loading: true, error: '' });
    ensurePlan(sessionId)
      .then(() => alive && setState({ loading: false, error: '' }))
      .catch((e) => alive && setState({ loading: false, error: String(e?.message || e) }));
    return () => {
      alive = false;
    };
  }, [sessionId, need]);
  return { loading: need && !state.error, error: state.error };
}
/** Loads the plan of an imported event's first upcoming session (organizer and moderator screens). */
export function useEnsureEventPlan(ev: EventItem | null | undefined) {
  const first = ev && ev.ext && !ev.schemeId ? eventSessions(ev.id).find((s) => (s.salesUntil || s.startsAt) > now()) || eventSessions(ev.id)[0] : undefined;
  return useEnsurePlan(first?.id);
}

// ---------------------------------------------------------------- one-day lifetime of local data

/** Clears everything this app keeps in localStorage (the interface language stays). */
export function clearLocalData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sayohat') && k !== 'sayohat-lang') keys.push(k);
    }
    keys.forEach((k) => safeLS('del', k));
  } catch {
    /* storage blocked */
  }
}
/** True when the local data is older than a day (or was never imported). */
export function localExpired() {
  const d = getDb();
  return !d.syncedAt || Date.now() - d.createdAt > LOCAL_TTL;
}
/** Clears expired local data (orders included) and imports the catalogue again. */
export async function refreshIfExpired(force = false) {
  const d = getDb();
  if (force || (d.syncedAt && Date.now() - d.createdAt > LOCAL_TTL)) {
    clearLocalData();
    initDb(true);
  }
  if (!getDb().syncedAt) await syncCatalog();
}
