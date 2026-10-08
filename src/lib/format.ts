import { t3, tx3, type L10n } from './i18n';

// ---------- Money ----------
/** Approximate rate for the "≈ $" hint shown to tourists (US-25). */
export const USD_RATE = 12650;
export const nfmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** "150 000 so'm" / "150 000 сум" / "150 000 UZS". */
export const sum = (n: number) => t3("{n} soʻm", '{n} сум', '{n} UZS', { n: nfmt(n) });
export function usd(n: number) {
  const v = n / USD_RATE;
  return '≈ $' + (v >= 100 ? Math.round(v) : v.toFixed(v < 10 ? 2 : 1));
}

// ---------- Phones ----------
export type Country = { iso: string; code: string; len: number[]; name: L10n };
export const COUNTRIES: Country[] = (
  [
    ['UZ', '998', [9], 'Oʻzbekiston', 'Узбекистан', 'Uzbekistan'],
    ['RU', '7', [10], 'Rossiya', 'Россия', 'Russia'],
    ['KZ', '7', [10], 'Qozogʻiston', 'Казахстан', 'Kazakhstan'],
    ['TJ', '992', [9], 'Tojikiston', 'Таджикистан', 'Tajikistan'],
    ['KG', '996', [9], 'Qirgʻiziston', 'Кыргызстан', 'Kyrgyzstan'],
    ['TM', '993', [8], 'Turkmaniston', 'Туркменистан', 'Turkmenistan'],
    ['TR', '90', [10], 'Turkiya', 'Турция', 'Türkiye'],
    ['DE', '49', [10, 11], 'Germaniya', 'Германия', 'Germany'],
    ['FR', '33', [9], 'Fransiya', 'Франция', 'France'],
    ['IT', '39', [9, 10], 'Italiya', 'Италия', 'Italy'],
    ['ES', '34', [9], 'Ispaniya', 'Испания', 'Spain'],
    ['GB', '44', [10], 'Buyuk Britaniya', 'Великобритания', 'United Kingdom'],
    ['US', '1', [10], 'AQSH', 'США', 'United States'],
    ['CN', '86', [11], 'Xitoy', 'Китай', 'China'],
    ['KR', '82', [9, 10], 'Janubiy Koreya', 'Южная Корея', 'South Korea'],
    ['JP', '81', [10], 'Yaponiya', 'Япония', 'Japan'],
    ['IN', '91', [10], 'Hindiston', 'Индия', 'India'],
    ['AE', '971', [9], 'BAA', 'ОАЭ', 'UAE'],
    ['PL', '48', [9], 'Polsha', 'Польша', 'Poland'],
    ['NL', '31', [9], 'Niderlandiya', 'Нидерланды', 'Netherlands'],
  ] as const
).map(([iso, code, len, uz, ru, en]) => ({ iso, code, len: [...len], name: tx3(uz, ru, en) }));

export const countryByIso = (iso: string) => COUNTRIES.find((c) => c.iso === iso) || COUNTRIES[0];
export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** E.164 string, or null when the length doesn't fit the country. */
export function normPhone(iso: string, num: string): string | null {
  const c = countryByIso(iso);
  let d = digits(num);
  if (d.startsWith(c.code) && c.len.includes(d.length - c.code.length)) d = d.slice(c.code.length);
  if (!c.len.includes(d.length)) return null;
  return '+' + c.code + d;
}
export function fmtPhone(e164: string | null | undefined) {
  if (!e164) return '';
  const d = digits(e164);
  const c = COUNTRIES.slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find((x) => d.startsWith(x.code) && x.len.includes(d.length - x.code.length));
  if (!c) return '+' + d;
  const n = d.slice(c.code.length);
  if (c.iso === 'UZ') return `+998 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  return `+${c.code} ${n.replace(/(\d{3})(?=\d{3,})/g, '$1 ')}`;
}
export function splitPhone(e164: string) {
  const d = digits(e164);
  const c = COUNTRIES.find((x) => d.startsWith(x.code) && x.len.includes(d.length - x.code.length)) || COUNTRIES[0];
  return { iso: c.iso, num: d.slice(c.code.length) };
}
export function maskPhone(e164: string) {
  const f = fmtPhone(e164);
  const total = digits(f).length;
  let seen = 0;
  return f.replace(/\d/g, (x) => {
    seen++;
    return seen <= total - 7 || seen > total - 2 ? x : '•';
  });
}
export const validEmail = (s: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());

/** "AA ***4567" — passports are shown partially on tickets and at the entry (US-32). */
export function maskDoc(doc: string) {
  const s = doc.replace(/\s+/g, '');
  const m = s.match(/^([A-Za-z]{1,3})(\d+)$/);
  if (m) return `${m[1].toUpperCase()} ***${m[2].slice(-4)}`;
  return s.length > 4 ? `***${s.slice(-4)}` : s;
}
