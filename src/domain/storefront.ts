/* How the storefront mixes iticket.uz categories with events created by Sayohat organizers. */
import { tx3, type L10n } from '../lib/i18n';
import type { EventKind } from './types';

/** iticket.uz category slug → kinds of local events shown in the same category. */
export const IT_CATEGORY_KINDS: Record<string, EventKind[]> = {
  concerts: ['concert'],
  'cultural-events': ['event'],
  'theaters-tashkent': ['theatre'],
  sport: ['sport'],
  samarkand: ['museum'],
  kids: [],
  'other-events': ['event'],
};

/** Categories that exist only on Sayohat (iticket.uz has no cinema or museum section of its own). */
export const LOCAL_CATEGORIES: { slug: string; name: L10n; kinds: EventKind[] }[] = [
  { slug: 'kino', name: tx3('Kino', 'Кино', 'Cinema'), kinds: ['cinema'] },
  { slug: 'muzeylar', name: tx3('Muzeylar', 'Музеи', 'Museums'), kinds: ['museum'] },
];

export const kindsForCategory = (slug: string | undefined): EventKind[] | null => {
  if (!slug) return null;
  const local = LOCAL_CATEGORIES.find((c) => c.slug === slug);
  if (local) return local.kinds;
  return IT_CATEGORY_KINDS[slug] ?? [];
};
export const isLocalCategory = (slug: string | undefined) => !!slug && LOCAL_CATEGORIES.some((c) => c.slug === slug);

/** Storefront URL of a local event. */
export const localEventUrl = (eventId: string) => `/e/${eventId}`;
