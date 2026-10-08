/* One card model for both sources of the storefront: iticket.uz events and events of Sayohat organizers. */
import type { ItEventShort } from '../../api/iticket';
import { t3, tl } from '../../lib/i18n';
import { addDays, dateKey, dowOf, fmtDate, hhmm, parseApiDate, todayKey } from '../../lib/time';
import { nfmt } from '../../lib/format';
import { cityName, getEvent, getVenue, kindName, minPrice, museumDay, nextStart, upcoming } from '../../domain/rules';
import { extEventId } from '../../sync/iticket';
import { localEventUrl } from '../../domain/storefront';
import type { EventCard as LocalCard, EventItem, EventKind } from '../../domain/types';

export type CardItem = {
  key: string;
  source: 'it' | 'local';
  /** Internal route, or an absolute URL when the event is sold elsewhere (iticket `external_url`). */
  href: string;
  external: boolean;
  title: string;
  /** iticket poster image. */
  img?: string;
  /** Background layer: iticket posters are a transparent PNG drawn over this image. */
  imgBg?: string;
  /** Local poster (generated or uploaded). */
  poster?: LocalCard;
  kind?: EventKind;
  age?: string | null;
  when: string;
  venue: string;
  venues: string[];
  city?: string;
  price: number | null;
  soldOut: boolean;
  /** First moment (ms) — used to sort by date. */
  start: number;
  /** Calendar days (Tashkent) the event can be visited on: a range for iticket, a list for local events. */
  range?: [string, string];
  dates?: string[];
};

/** "50 000 soʻm dan" / "от 50 000 сум" / "from 50 000 UZS". */
export const priceFrom = (n: number) => t3('{n} soʻm dan', 'от {n} сум', 'from {n} UZS', { n: nfmt(n) });

/** Date line of an iticket event: one day with time, or a range when it spans several days. */
export function itWhen(startsAt: string, endsAt: string) {
  const a = parseApiDate(startsAt);
  const b = parseApiDate(endsAt);
  if (!Number.isFinite(a)) return '';
  if (!Number.isFinite(b) || dateKey(a) === dateKey(b)) return `${fmtDate(a)}, ${hhmm(a)}`;
  return `${fmtDate(a, { weekday: false })} – ${fmtDate(b, { weekday: false })}`;
}

export const itEventPath = (ev: Pick<ItEventShort, 'category_slug' | 'slug'>) => `/events/${ev.category_slug}/${ev.slug}`;

/**
 * Card of an iticket event. Events imported into Sayohat link to their Sayohat page (same data the organizer
 * and the moderator see, sold here); only events iticket sends elsewhere keep their external link.
 */
export function fromIt(ev: ItEventShort): CardItem {
  const local = getEvent(extEventId(ev.id));
  if (local && local.status === 'published') return fromLocal(local);
  const a = parseApiDate(ev.event_starts_at);
  const b = parseApiDate(ev.event_ends_at);
  const venues = (ev.venues || []).map((v) => v.name);
  return {
    key: 'it' + ev.id,
    source: 'it',
    href: ev.external_url || itEventPath(ev),
    external: !!ev.external_url,
    title: ev.name,
    img: ev.poster_url,
    imgBg: ev.poster_bg_url && !/no-poster/.test(ev.poster_bg_url) ? ev.poster_bg_url : undefined,
    age: ev.age_limit,
    when: itWhen(ev.event_starts_at, ev.event_ends_at),
    venue: venues.join(', '),
    venues,
    price: ev.min_price > 0 ? ev.min_price : null,
    soldOut: ev.available_tickets_count === 0,
    start: Number.isFinite(a) ? a : 0,
    range: Number.isFinite(a) ? [dateKey(a), dateKey(Number.isFinite(b) ? b : a)] : undefined,
  };
}

/** Days a local event can be visited on (sessions on sale, or open museum days). */
export function localDates(ev: EventItem): string[] {
  if (ev.kind === 'museum') {
    const out: string[] = [];
    for (let i = 0; i <= (ev.museum?.ahead || 30); i++) {
      const d = addDays(todayKey(), i);
      if (museumDay(ev, d).open) out.push(d);
    }
    return out;
  }
  return [...new Set(upcoming(ev).map((s) => dateKey(s.startsAt)))];
}

export function fromLocal(ev: EventItem): CardItem {
  const venue = getVenue(ev.venueId);
  const next = nextStart(ev);
  const dates = localDates(ev);
  let when = '';
  if (ev.kind === 'museum') when = dates[0] ? `${t3('Har kuni', 'Ежедневно', 'Daily')} · ${t3('eng yaqin', 'ближайший', 'next')}: ${fmtDate(dates[0])}` : '';
  else if (next != null) when = `${fmtDate(next)}, ${hhmm(next)}${dates.length > 1 ? ` · +${dates.length - 1}` : ''}`;
  return {
    key: 'l' + ev.id,
    source: 'local',
    href: localEventUrl(ev.id),
    external: false,
    title: tl(ev.card.title) || t3('Nomsiz', 'Без названия', 'Untitled'),
    poster: ev.card,
    kind: ev.kind,
    age: ev.card.age || null,
    when,
    venue: venue?.name || '',
    venues: venue ? [venue.name] : [],
    city: venue ? cityName(venue.city) : undefined,
    price: minPrice(ev),
    soldOut: false,
    start: next ?? Infinity,
    dates,
  };
}

export const kindLabel = (k: EventKind | undefined) => (k ? kindName(k) : '');

// ---------------------------------------------------------------- date filter

export type DateFilter = '' | 'today' | 'tomorrow' | 'weekend' | 'date';

/** Days covered by a date filter (Tashkent calendar). */
export function filterDays(f: DateFilter, picked: string): string[] {
  const t = todayKey();
  if (f === 'today') return [t];
  if (f === 'tomorrow') return [addDays(t, 1)];
  if (f === 'date') return picked ? [picked] : [];
  if (f === 'weekend') {
    const out: string[] = [];
    for (let i = 0; i < 7 && out.length < 2; i++) {
      const d = addDays(t, i);
      const w = dowOf(d);
      if (w === 6 || w === 0) out.push(d);
      if (w === 0) break;
    }
    return out;
  }
  return [];
}

export function matchesDays(it: CardItem, days: string[]) {
  if (!days.length) return true;
  if (it.range) return days.some((d) => d >= it.range![0] && d <= it.range![1]);
  if (it.dates) return days.some((d) => it.dates!.includes(d));
  return false;
}
