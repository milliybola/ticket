/*
 * Read-only client of the public iticket.uz API (https://api.iticket.uz/{lang}/v5/...). No token is needed:
 * every endpoint used here is public and sends `access-control-allow-origin: *`.
 * Nothing here writes to iticket (no cart, no orders): their stock is real, so the storefront only reads it.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLangStore, type Lang } from '../lib/i18n';

export const IT_API = 'https://api.iticket.uz';
export const IT_SITE = 'https://iticket.uz';
export const IT_CDN = 'https://cdn.iticket.uz/';

// ---------------------------------------------------------------- response types

export interface ItVenueShort {
  id: number;
  map_lat: string | null;
  map_lng: string | null;
  phone: string | null;
  mobile: string | null;
  name: string;
  headline?: string | null;
  address?: string | null;
}
export interface ItVenue extends ItVenueShort {
  code?: string;
  slug: string;
  email?: string | null;
  website?: string | null;
  poster_url?: string;
  cover_url?: string;
  icon_url?: string;
  description?: string | null;
}
export interface ItEventShort {
  id: number;
  category_id: number;
  slug: string;
  age_limit: string | null;
  event_starts_at: string;
  event_ends_at: string;
  sell_starts_at: string;
  sell_ends_at: string;
  available_tickets_count: number;
  upcoming_mode: unknown;
  min_price: number;
  max_price: number;
  category_slug: string;
  venues: ItVenueShort[];
  public_state: number;
  poster_url: string;
  poster_bg_url?: string;
  poster_wide_url?: string;
  poster_wide_bg_url?: string;
  name: string;
  external_url: string | null;
  slide_type?: string;
  slide_url?: string;
}
export interface ItSession {
  id: number;
  event_id: number;
  venue_id: number;
  session_starts_at: string;
  session_ends_at: string;
  sell_starts_at: string;
  sell_ends_at: string;
  session_lang: string | null;
  min_price: number;
  max_price: number;
  available_tickets_count: number;
  age_limit: string | null;
  status: number;
  map_description: string | null;
  venue: ItVenue;
  session_dates: string;
  session_lang_label: string;
  name: string;
  description: string | null;
}
export interface ItEvent extends ItEventShort {
  ou_id: number;
  sell_method: number;
  is_refundable: boolean;
  headline: string | null;
  description: string | null;
  poster_square_url?: string;
  cover_url?: string;
  artist_url?: string | null;
  artist_bg_url?: string | null;
  gallery: { url?: string; image_url?: string }[] | null;
  embed: unknown;
  sessions: ItSession[];
  similar: ItEventShort[];
  meta: { title: string; description: string; keywords?: string[] };
  venues: ItVenue[];
}
export interface ItCategory {
  id: number;
  slug: string;
  ordering: number;
  name: string;
  external_url: string | null;
}
export interface ItPromotion {
  id: number;
  skin: number;
  name: string;
  items: { type: 'event' | string; data: ItEventShort }[];
}
export interface ItPage<T> {
  current_page: number;
  data: T[];
  next_page_url: string | null;
  prev_page_url: string | null;
  per_page: number;
  from: number | null;
  to: number | null;
}
export interface ItEventsResponse {
  venues: ItVenueShort[];
  prices: { min: number; max: number };
  events: ItPage<ItEventShort>;
  category: Partial<ItCategory> | [];
}

// ---- seat manifest (the seat map of one session)
export interface ItVariation {
  price_category_id: number;
  price_category_name: string;
  buyer_type_id: number;
  buyer_type_name: string;
  buyer_type_combo: boolean;
  buyer_type_limit: { min: string; step: string; max: string };
  price: number;
  available: number;
}
export interface ItLegend {
  price_category_id: number;
  price_category_name: string;
  color: { id: number; bg_color: string; txt_color: string };
  price: number;
  available: number;
}
export interface ItSector {
  id: number;
  name: string;
  path: string | null;
  /** On sale. */
  os: boolean;
  available: Record<string, number> | 0;
  is_ga: boolean;
  config_url: string;
  variations: ItVariation[];
}
export interface ItSeat {
  id: number;
  row_label: string;
  seat_label: string;
  sector_id: number;
  sector_label: string;
  /** null = not on sale (sold or blocked); otherwise the ticket that can be bought. */
  ticket: { id: number; ticket_status: number; price_category_id: number; sector_id: number; price: number; price_category_color_id: number } | null;
}
export interface ItManifest {
  options: {
    session_id: number;
    show_available: boolean;
    session_lang: string | null;
    available: number;
    price_max: number;
    price_min: number;
    description: string | null;
    cdn_url: string;
    svg_url: string | null;
    view: 'scheme' | 'sector' | string;
    name: string;
    only_ga: boolean;
    step: number;
  };
  legends: ItLegend[];
  variations: ItVariation[];
  sectors?: ItSector[];
  /** Seats grouped by a zero-padded row key. Empty array when the map has no numbered seats. */
  seats?: Record<string, ItSeat[]> | [];
  table_config: unknown;
  views: { key: string; label: string; default: boolean }[];
  cart_limit: string | number;
}
export interface ItSearch {
  events: ItEventShort[];
  venues: ItVenue[];
}
export interface ItStaticPage {
  title: string;
  content: string | { question: string; answer: string }[];
}

// ---------------------------------------------------------------- client

export class ItApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** GET {IT_API}/{lang}/v5{path} and unwraps `response`. `client=web` is added automatically. */
export async function itGet<T>(lang: Lang, path: string, params: Record<string, string | number | undefined | null> = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${IT_API}/${lang}/v5${path}`);
  url.searchParams.set('client', 'web');
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  const body = (await res.json().catch(() => null)) as { status?: number; result?: string; response?: unknown } | null;
  if (!res.ok || !body || body.result !== 'success') throw new ItApiError(body?.status || res.status, `iticket ${path}: ${res.status}`);
  return body.response as T;
}

/** Full URL of a file on the iticket CDN. */
export const itCdn = (path: string | null | undefined) => (!path ? '' : /^https?:/.test(path) ? path : IT_CDN + path.replace(/^\//, ''));

// ---------------------------------------------------------------- hooks

const useLang = () => useLangStore((s) => s.lang);
const MIN5 = 5 * 60e3;

export function useItCategories() {
  const lang = useLang();
  return useQuery({ queryKey: ['it', lang, 'categories'], queryFn: ({ signal }) => itGet<ItCategory[]>(lang, '/categories', {}, signal), staleTime: 30 * 60e3 });
}
export function useItPromotions() {
  const lang = useLang();
  return useQuery({ queryKey: ['it', lang, 'promotions'], queryFn: ({ signal }) => itGet<ItPromotion[]>(lang, '/promotions', {}, signal), staleTime: MIN5 });
}
export function useItBanners() {
  const lang = useLang();
  return useQuery({
    queryKey: ['it', lang, 'banners'],
    queryFn: ({ signal }) => itGet<{ top?: { image: string; mobile_image: string; link: string } }>(lang, '/banners', {}, signal),
    staleTime: 30 * 60e3,
  });
}
export type ItEventsFilter = { category_slug?: string; venue_id?: number; page?: number };
export function useItEvents(f: ItEventsFilter, enabled = true) {
  const lang = useLang();
  return useQuery({
    queryKey: ['it', lang, 'events', f],
    queryFn: ({ signal }) => itGet<ItEventsResponse>(lang, '/events', { category_slug: f.category_slug, venue_id: f.venue_id, page: f.page }, signal),
    staleTime: MIN5,
    placeholderData: keepPreviousData,
    enabled,
  });
}
/** Every page of a listing (iticket pages by 15); stops at `maxPages`. */
export async function itAllEvents(lang: Lang, f: Omit<ItEventsFilter, 'page'>, maxPages = 6, signal?: AbortSignal) {
  const first = await itGet<ItEventsResponse>(lang, '/events', { category_slug: f.category_slug, venue_id: f.venue_id }, signal);
  const all = [...first.events.data];
  let page = 1;
  let next = first.events.next_page_url;
  while (next && page < maxPages) {
    page++;
    const r = await itGet<ItEventsResponse>(lang, '/events', { category_slug: f.category_slug, venue_id: f.venue_id, page }, signal);
    all.push(...r.events.data);
    next = r.events.next_page_url;
  }
  return { ...first, events: { ...first.events, data: all, next_page_url: next } };
}
export function useItAllEvents(f: Omit<ItEventsFilter, 'page'>, maxPages = 6, enabled = true) {
  const lang = useLang();
  return useQuery({ queryKey: ['it', lang, 'events-all', f, maxPages], queryFn: ({ signal }) => itAllEvents(lang, f, maxPages, signal), staleTime: MIN5, enabled });
}
export function useItEvent(category: string | undefined, slug: string | undefined) {
  const lang = useLang();
  return useQuery({
    queryKey: ['it', lang, 'event', category, slug],
    queryFn: ({ signal }) => itGet<ItEvent>(lang, `/events/${category}/${slug}`, {}, signal),
    enabled: !!category && !!slug,
    staleTime: MIN5,
  });
}
/** Seat map of a session (or of one sector when sectorId is given). Live stock: refreshed every 30 s. */
export function useItManifest(sessionId: number | string | undefined, sectorId?: number | string | null) {
  const lang = useLang();
  return useQuery({
    queryKey: ['it', lang, 'manifest', sessionId, sectorId || null],
    queryFn: ({ signal }) => itGet<ItManifest>(lang, `/manifest/config/${sessionId}${sectorId ? '/' + sectorId : ''}`, {}, signal),
    enabled: !!sessionId,
    staleTime: 15e3,
    refetchInterval: 30e3,
  });
}
export function useItVenues(page = 1) {
  const lang = useLang();
  return useQuery({ queryKey: ['it', lang, 'venues', page], queryFn: ({ signal }) => itGet<ItPage<ItVenue>>(lang, '/venues', { page }, signal), staleTime: 30 * 60e3, placeholderData: keepPreviousData });
}
export function useItVenue(slug: string | undefined) {
  const lang = useLang();
  return useQuery({ queryKey: ['it', lang, 'venue', slug], queryFn: ({ signal }) => itGet<ItVenue>(lang, `/venues/${slug}`, {}, signal), enabled: !!slug, staleTime: 30 * 60e3 });
}
export function useItSearch(q: string) {
  const lang = useLang();
  const query = q.trim();
  return useQuery({
    queryKey: ['it', lang, 'search', query],
    queryFn: ({ signal }) => itGet<ItSearch>(lang, '/search', { q: query }, signal),
    enabled: query.length >= 2,
    staleTime: MIN5,
    placeholderData: keepPreviousData,
  });
}
/** Static pages: about, faq, rules, privacy, return, eticket, support. */
export function useItPage(slug: string | undefined) {
  const lang = useLang();
  return useQuery({ queryKey: ['it', lang, 'page', slug], queryFn: ({ signal }) => itGet<ItStaticPage>(lang, `/page/${slug}`, {}, signal), enabled: !!slug, staleTime: 60 * 60e3 });
}

/** Link to the same page on iticket.uz (the place where their tickets are actually sold). */
export const itSiteUrl = (lang: Lang, path: string) => `${IT_SITE}${lang === 'uz' ? '' : '/' + lang}${path}`;
