import { getLang, t3 } from './i18n';

/** Everything is shown in Tashkent time (UTC+5), tourists included (US-13 DoD). */
const TZ_OFF = 5 * 3600e3;
export const MIN = 60e3;
export const HOUR = 3600e3;
export const DAY = 864e5;

/** Demo time travel offset in ms (set from the demo tools). */
let CLOCK_OFFSET = 0;
export const setClockOffset = (ms: number) => {
  CLOCK_OFFSET = ms;
};
export const getClockOffset = () => CLOCK_OFFSET;
export const now = () => Date.now() + CLOCK_OFFSET;

export const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar parts of a moment in Tashkent. */
export function tk(ms: number) {
  const d = new Date(ms + TZ_OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
}
/** 'YYYY-MM-DD' + 'HH:MM' in Tashkent → ms. */
export function tkMs(dateStr: string, timeStr = '00:00'): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mi] = timeStr.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mi) - TZ_OFF;
}
export function dateKey(ms: number) {
  const p = tk(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export function hhmm(ms: number) {
  const p = tk(ms);
  return `${pad(p.hh)}:${pad(p.mi)}`;
}
export const addDays = (dateStr: string, n: number) => dateKey(tkMs(dateStr, '12:00') + n * DAY);
export const dowOf = (dateStr: string) => tk(tkMs(dateStr, '12:00')).dow;
export const todayKey = () => dateKey(now());
export const minOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const timeOf = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const MONTHS_GEN = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
export const MONTHS_NOM = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: MONTHS_GEN.en,
};
export const DOW_SHORT = {
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
export const DOW_LONG = {
  uz: ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'],
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** "14-noyabr, Ch" / "ср, 14 ноября" / "Wed, 14 November". Accepts ms or 'YYYY-MM-DD'. */
export function fmtDate(v: number | string, opts: { year?: boolean; weekday?: boolean } = {}) {
  const L = getLang();
  const ms = typeof v === 'string' ? tkMs(v, '12:00') : v;
  const p = tk(ms);
  const yr = opts.year || p.y !== tk(now()).y ? ` ${p.y}` : '';
  const wd = opts.weekday === false ? '' : DOW_SHORT[L][p.dow];
  if (L === 'uz') return `${p.d}-${MONTHS_GEN.uz[p.m - 1]}${yr}${wd ? ', ' + wd : ''}`;
  if (L === 'en') return `${wd ? wd + ', ' : ''}${p.d} ${MONTHS_GEN.en[p.m - 1]}${yr}`;
  return `${wd ? wd + ', ' : ''}${p.d} ${MONTHS_GEN.ru[p.m - 1]}${yr}`;
}
export const fmtDT = (ms: number, opts?: { year?: boolean; weekday?: boolean }) => `${fmtDate(ms, opts)}, ${hhmm(ms)}`;
export function fmtStamp(ms: number) {
  const p = tk(ms);
  return `${pad(p.d)}.${pad(p.m)}.${p.y} ${pad(p.hh)}:${pad(p.mi)}`;
}
/** Day and short month for poster cards: { day: '14', month: 'noy' }. */
export function dayMonth(ms: number) {
  const p = tk(ms);
  const L = getLang();
  return { day: String(p.d), month: MONTHS_NOM[L][p.m - 1].slice(0, 3), dow: DOW_SHORT[L][p.dow], time: hhmm(ms) };
}
export function relDay(dateStr: string) {
  const t = todayKey();
  if (dateStr === t) return t3('Bugun', 'Сегодня', 'Today');
  if (dateStr === addDays(t, 1)) return t3('Ertaga', 'Завтра', 'Tomorrow');
  return '';
}
export function ago(ms: number) {
  const m = Math.round((now() - ms) / 60000);
  if (m < 1) return t3('hozirgina', 'только что', 'just now');
  if (m < 60) return t3('{n} daqiqa oldin', '{n} мин назад', '{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t3('{n} soat oldin', '{n} ч назад', '{n} h ago', { n: h });
  return t3('{n} kun oldin', '{n} дн. назад', '{n} days ago', { n: Math.round(h / 24) });
}
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
/** ISO string from the iticket API ("2026-10-08T01:00:00.000000Z" or "2026-10-08 22:00:00" in Tashkent) → ms. */
export function parseApiDate(s: string | null | undefined): number {
  if (!s) return NaN;
  if (/Z$|[+-]\d\d:?\d\d$/.test(s)) return Date.parse(s.replace(/\.(\d{3})\d+Z$/, '.$1Z'));
  const [d, t] = s.split(' ');
  return tkMs(d, (t || '00:00').slice(0, 5));
}
