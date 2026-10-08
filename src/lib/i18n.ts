import { create } from 'zustand';

/** Interface languages. Uzbek (Latin) is the default, like iticket.uz. */
export type Lang = 'uz' | 'ru' | 'en';
export const LANGS: Lang[] = ['uz', 'ru', 'en'];
export const LANG_LABEL: Record<Lang, string> = { uz: 'Oʻzbekcha', ru: 'Русский', en: 'English' };
export const LANG_SHORT: Record<Lang, string> = { uz: 'UZ', ru: 'RU', en: 'EN' };

/** A text in all three languages. */
export type L10n = { uz: string; ru: string; en: string };

const LS_KEY = 'sayohat-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_KEY) as Lang | null;
    if (saved && LANGS.includes(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'uz').slice(0, 2);
  return nav === 'ru' ? 'ru' : nav === 'en' ? 'en' : 'uz';
}

/** The current language, readable outside React (domain code formats texts with it). */
let LANG: Lang = initialLang();
export const getLang = () => LANG;

type LangState = { lang: Lang; setLang: (l: Lang) => void };
export const useLangStore = create<LangState>((set) => ({
  lang: LANG,
  setLang: (l) => {
    LANG = l;
    try {
      localStorage.setItem(LS_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
    set({ lang: l });
  },
}));

export function fill(s: string, vars?: Record<string, string | number>): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
}

/** Inline translation in the order uz, ru, en: t3('Salom', 'Привет', 'Hello'). */
export function t3(uz: string, ru: string, en: string, vars?: Record<string, string | number>): string {
  return fill(LANG === 'ru' ? ru : LANG === 'en' ? en : uz, vars);
}

/** Builds an L10n object (uz, ru, en). */
export const tx3 = (uz: string, ru: string, en: string): L10n => ({ uz, ru, en });

/** Picks the current language from an L10n object; plain strings pass through. */
export function tl(obj: L10n | string | null | undefined, lang: Lang = LANG): string {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.uz || obj.ru || obj.en || '';
}

/** Text in a given language (for SMS and emails, which go out in the buyer's language). */
export const inLang = (lang: Lang, uz: string, ru: string, en: string) => (lang === 'ru' ? ru : lang === 'en' ? en : uz);

/** Runs fn with another interface language, e.g. to format a date for an email. */
export function withLang<T>(lang: Lang, fn: () => T): T {
  const prev = LANG;
  LANG = lang;
  try {
    return fn();
  } finally {
    LANG = prev;
  }
}

/** Plural word: ru = [one, few, many], en = [one, other]; Uzbek does not inflect after numbers. */
export function plw(n: number, uz: string, ru: [string, string, string], en: [string, string]): string {
  if (LANG === 'uz') return uz;
  if (LANG === 'en') return n === 1 ? en[0] : en[1];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return ru[2];
  if (b === 1) return ru[0];
  if (b >= 2 && b <= 4) return ru[1];
  return ru[2];
}
export const nTickets = (n: number) => `${n} ${plw(n, 'ta chipta', ['билет', 'билета', 'билетов'], ['ticket', 'tickets'])}`;
export const nSeats = (n: number) => `${n} ${plw(n, 'ta joy', ['место', 'места', 'мест'], ['seat', 'seats'])}`;

/**
 * Every component that shows text calls this hook: it re-renders the component when the language changes.
 * Returns the same helpers as the module (t3, tl) for convenience.
 */
export function useI18n() {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return { lang, setLang, t3, tl };
}
