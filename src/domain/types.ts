import type { L10n, Lang } from '../lib/i18n';

/**
 * Kinds of events the platform sells. The kind decides how a venue, sessions and prices work:
 *  - concert, sport, event — seating plan, price per sector/zone/table, one-off dates, postponement;
 *  - theatre — seating plan, ticket types × seat category, recurring weekly schedule;
 *  - cinema — several halls, showtimes per hall, ticket types × seat category;
 *  - museum — no plan: opening hours, time slots with a limit, ticket types (passport rules).
 */
export type EventKind = 'concert' | 'theatre' | 'cinema' | 'museum' | 'sport' | 'event';
export const EVENT_KINDS: EventKind[] = ['concert', 'theatre', 'cinema', 'museum', 'sport', 'event'];

export type VenueType = 'scheme' | 'timed';
export type EventStatus = 'draft' | 'moderation' | 'published' | 'rework';
export type OrgStatus = 'review' | 'approved' | 'rework';

// ---------------------------------------------------------------- seating plans

export type ElType = 'seats' | 'lounge' | 'fan' | 'table' | 'stage' | 'unknown';
export type TableMode = 'whole' | 'seats' | 'both';
/** How seats in a row are numbered. 'oddeven': odd numbers on the left half, even on the right (theatre style). */
export type Numbering = 'ltr' | 'rtl' | 'oddeven';
export type RowAlign = 'center' | 'left' | 'right';

export interface SeatCat {
  id: string;
  name: L10n;
  color: string;
}
/** An outline imported from SVG: tag, geometry attributes and the transform matrix to the plan. */
export interface Shape {
  tag: string;
  a: Record<string, string | number>;
  m: number[];
}
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A seat taken from an SVG file: row label, number and position in plan coordinates. */
export interface RawSeat {
  r: number | string;
  n: number;
  x: number;
  y: number;
}

export interface SchemeEl {
  id: string;
  type: ElType;
  name: string;
  /** Offset and rotation (degrees) of the element on the plan. */
  x: number;
  y: number;
  rot: number;
  src: 'svg' | 'manual';
  /** Bumped on every change, used to cache the generated seats. */
  rev: number;
  /** Default seat category of the element. */
  cat?: string;

  // --- seats / lounge: generated grid
  /** 'grid' — straight rows; 'arc' — rows are arcs around the element origin (arena bowls, amphitheatres). */
  layout?: 'grid' | 'arc';
  /** Arc layout: inner radius of the first row and the angle span in degrees (0° = right, 90° = down). */
  arcR?: number;
  arcFrom?: number;
  arcTo?: number;
  /** Vertical aisles: a gap after these seat positions (1-based, in drawing order). Seat numbers stay continuous. */
  aisles?: number[];
  /** Horizontal walkways: a gap after these rows (1-based). */
  rowAisles?: number[];
  /** Width of an aisle in plan units (default: one seat step). */
  aisleGap?: number;
  rows?: number[];
  rowStart?: number;
  /** Row labels: numbers (1, 2, 3) or letters (A, B, C). */
  rowLabels?: 'num' | 'alpha';
  numbering?: Numbering;
  align?: RowAlign;
  /** Bend of the rows in degrees of arc (0 = straight, 60 = amphitheatre). */
  curve?: number;
  seatGap?: number;
  rowGap?: number;
  /** Extra seat number offset per row, e.g. a sector whose numbering continues from another one. */
  seatStart?: number;
  // --- seats / lounge: seats imported from SVG
  pts?: RawSeat[];
  /** Seat radius taken from the SVG file (big imported plans have big seats). */
  seatR?: number;
  /** Removed seat slots, 'row|n' (aisles, columns). Numbers of other seats do not change. */
  removed?: string[];
  /** Per-seat category overrides, 'row|n' → category id. */
  seatCat?: Record<string, string>;
  shape?: Shape;
  bb?: BBox;
  gridFromSvg?: boolean;
  notes?: string[];

  // --- fan zone / stage / unknown
  w?: number;
  h?: number;
  limit?: number | null;

  // --- table
  tableSeats?: number;
  /** Id of the sector on iticket.uz (plans imported from there). */
  extId?: string;
  mode?: TableMode;
}

export interface Scheme {
  w: number;
  h: number;
  cats: SeatCat[];
  els: SchemeEl[];
}

/** One generated seat in plan-element coordinates. */
export interface Seat {
  key: string;
  row: number | string;
  n: number;
  x: number;
  y: number;
  cat: string;
}

// ---------------------------------------------------------------- organizers, venues

export interface Decision {
  at: number;
  by: string;
  decision: 'submitted' | 'resubmitted' | 'approved' | 'rework' | 'withdrawn';
  reason: string;
}

/** Link of an object to its source on iticket.uz (catalogue imported from there). */
export interface ExtRef {
  /** iticket id. */
  id: number;
  /** Event: category and slug of its iticket page. */
  category?: string;
  slug?: string;
}

export interface Org {
  id: string;
  ext?: ExtRef;
  name: string;
  kinds: EventKind[];
  contact: string;
  phone: string;
  email: string;
  password: string;
  lang: Lang;
  status: OrgStatus;
  createdAt: number;
  submittedAt: number;
  resubmitted: boolean;
  changed: string[];
  prev?: Partial<Pick<Org, 'name' | 'contact' | 'email' | 'phone' | 'kinds'>>;
  history: Decision[];
}

export interface Moderator {
  id: string;
  name: string;
  email: string;
  password: string;
}

export interface Hall {
  id: string;
  name: string;
  order: number;
  schemeId: string;
}

export interface Venue {
  id: string;
  ext?: ExtRef;
  orgId: string;
  name: string;
  city: string;
  address: string;
  point: { lat: number; lng: number } | null;
  type: VenueType;
  halls: Hall[];
  deletedHalls?: Hall[];
  createdAt: number;
  createdBy: 'org' | 'mod';
}

export interface VenueRequest {
  id: string;
  orgId: string;
  name: string;
  city: string;
  address: string;
  type: VenueType;
  file: { name: string; size: number; data?: string } | null;
  comment: string;
  status: 'new' | 'progress' | 'done' | 'declined';
  reason: string;
  venueId: string | null;
  createdAt: number;
  history: { at: number; by: string; status: VenueRequest['status']; reason: string }[];
}

// ---------------------------------------------------------------- events

export type PassportRule = 'none' | 'citizen' | 'foreigner';

export interface TicketType {
  id: string;
  name: L10n;
  /** Museum: one price. */
  price?: number;
  /** Theatre and cinema: price per seat category id. */
  prices?: Record<string, number>;
  /** Requirement shown before payment, to the cashier and at the entry, e.g. "show your student ID". */
  req: L10n | null;
  passport: PassportRule;
  hidden: boolean;
  order: number;
}

export interface DayHours {
  open: string;
  close: string;
  off: boolean;
}
export interface MuseumCfg {
  /** Opening hours by weekday, 0 = Sunday. */
  hours: Record<number, DayHours>;
  /** Slot length in minutes. */
  slot: number;
  /** Tickets per slot, shared by online and the box office. */
  limit: number;
  /** How many days ahead sales are open. */
  ahead: number;
  offDays: { date: string; reason: string }[];
  /** Per-slot limit overrides, 'YYYY-MM-DD|HH:MM' → limit. */
  overrides: Record<string, number>;
  /** Days that already had sales keep the plan they were sold under. */
  keep?: Record<string, { h: DayHours; slot: number }>;
}

export interface EventCard {
  title: L10n;
  desc: L10n;
  /** Minutes. */
  duration: number;
  age: string;
  /** Generated poster (hue + motif) or an uploaded image (data URL). */
  /** Generated poster (hue + motif) or an image (data URL or URL); `bg` is drawn under a transparent image (iticket posters). */
  poster: { hue: number; motif: string; image?: string | null; bg?: string | null };
  /** Language of the performance, free text. */
  lang?: string;
}

export interface Schedule {
  id: string;
  days: number[];
  time: string;
  from: string;
  to: string;
  excluded: string[];
  hallId?: string;
}

export interface VenueChange {
  from: string;
  to: string;
  status: 'pending' | 'approved' | 'rework';
  submittedAt: number;
  decidedAt?: number;
  by?: string;
  reason?: string;
}

export interface PriceTier {
  /** Row range, inclusive (row numbers; letters count A = 1). */
  from: number;
  to: number;
  price: number;
}
export interface EventPrices {
  /** Element id → price (concert, sport, event). Applies to rows no tier covers. */
  els: Record<string, number>;
  /** Element id → prices by row range: rows 1–5 of a sector can cost more than rows 6–20. */
  rows?: Record<string, PriceTier[]>;
  /** Seat category id → price, for seats with no element or row price (plans imported with price categories). */
  cats?: Record<string, number>;
  tables: Record<string, { whole?: number; seat?: number }>;
}

export interface EventItem {
  id: string;
  ext?: ExtRef;
  /** Lowest price known from the source before the plan is loaded ("from" on the storefront). */
  extMinPrice?: number | null;
  orgId: string;
  kind: EventKind;
  venueId: string | null;
  status: EventStatus;
  card: EventCard;
  /** The event's own copy of the plan (concert, theatre, sport, event). Cinema sessions copy their hall plan. */
  schemeId: string | null;
  /** Hall (layout) the plan was copied from: one arena has a concert, a UFC and a hockey layout. */
  hallId?: string | null;
  prices: EventPrices;
  types: TicketType[];
  museum: MuseumCfg | null;
  schedules: Schedule[];
  createdAt: number;
  submittedAt: number | null;
  firstPublishedAt: number | null;
  history: Decision[];
  resubmitted: boolean;
  venueChange: VenueChange | null;
  vcHistory: (Decision & { from: string; to: string })[];
}

export interface Session {
  id: string;
  /** iticket session id: its plan, prices and free seats are loaded from there when first needed. */
  extId?: number;
  /** Seat keys free on iticket when the plan was loaded; every other seat of the plan is taken. */
  extAvail?: string[] | null;
  /** When the plan was loaded from iticket. */
  extLoadedAt?: number | null;
  /** Tickets left on iticket at import time (shown until the plan is loaded). */
  extFree?: number | null;
  eventId: string;
  startsAt: number;
  doorsAt: number | null;
  salesUntil: number | null;
  hallId: string | null;
  /** Minutes. */
  duration: number;
  schemeId: string | null;
  scheduleId: string | null;
  postponed: { from: number; to: number; at: number; reason: string; notified: number; failed: number }[];
  createdAt: number;
}

// ---------------------------------------------------------------- sales

export type Channel = 'online' | 'box';

export type HoldItem =
  | { k: 'seat'; key: string; elId: string; label: L10n; price: number; cat: string; typeId?: string | null }
  | { k: 'table'; elId: string; seats: string[]; seatLabels: L10n[]; label: L10n; price: number }
  | { k: 'zone'; elId: string; qty: number; label: L10n; price: number }
  | { k: 'slot'; qty: number; label: L10n; price: number; typeId: string };

export interface Hold {
  id: string;
  /** Sale unit: a session id, or a museum slot id 'm~eventId~date~HH:MM'. */
  sid: string;
  channel: Channel;
  holder: string;
  items: HoldItem[];
  createdAt: number;
  expiresAt: number;
  /** Payment started: the places are not released until the payment system answers (US-30 AC4). */
  paying: boolean;
  lang: Lang;
}

export interface Buyer {
  name: string;
  phone: string;
  email: string;
}
export interface Visitor {
  name: string;
  doc: string;
  citizen: boolean;
  country?: string;
}

export type PayMethod = 'payme' | 'click' | 'uzum' | 'humo' | 'uzcard' | 'visa' | 'mastercard' | 'cash' | 'qr';

export interface Fiscal {
  no: string;
  sign: string;
  terminal: string;
  at: number;
  total: number;
}

export interface Order {
  id: string;
  sid: string;
  ev: string;
  ch: Channel;
  buyer: Buyer;
  lang: Lang;
  total: number;
  pay: { method: PayMethod; at: number; received?: number };
  at: number;
  fiscal: Fiscal;
  tickets: string[];
  prints: number;
  account?: string;
}

export interface Ticket {
  id: string;
  code: string;
  oid: string;
  sid: string;
  ev: string;
  ch: Channel;
  at: number;
  used: number | null;
  usedBy?: string;
  denied: number[];
  k: 'seat' | 'zone' | 'slot';
  /** Seat key for seats. */
  sk?: string;
  el?: string;
  whole?: boolean;
  lb: L10n;
  p: number;
  ty?: string;
  tn?: L10n;
  rq?: L10n | null;
  v?: Visitor | null;
}

export interface LogEntry {
  id: string;
  at: number;
  who: { role: 'org' | 'mod' | 'buyer' | 'system'; id: string; name: string };
  act: string;
  obj: string;
  details: string;
}
export interface OutboxMsg {
  id: string;
  at: number;
  ch: 'sms' | 'email';
  to: string;
  subject: string;
  body: string;
  lang: Lang;
  tag: string;
  failed?: boolean;
}

export interface BuyerAccount {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: number;
}

export interface Db {
  v: number;
  /** When the catalogue was imported from iticket.uz (null: not yet). The whole local data lives one day. */
  syncedAt?: number | null;
  rev: number;
  createdAt: number;
  demo: { clock: number; passportUp: boolean; boxOnline: boolean; entryOnline: boolean };
  orgs: Org[];
  mods: Moderator[];
  venues: Venue[];
  schemes: Record<string, Scheme>;
  venueReqs: VenueRequest[];
  events: EventItem[];
  sessions: Session[];
  holds: Hold[];
  orders: Order[];
  tickets: Ticket[];
  outbox: OutboxMsg[];
  log: LogEntry[];
  buyers: BuyerAccount[];
}
