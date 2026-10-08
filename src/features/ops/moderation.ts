/* Moderator helpers. */
import { addDays, now, tkMs, todayKey } from '../../lib/time';
import { dayCfg, eventSessions, museumDay } from '../../domain/rules';
import type { EventItem } from '../../domain/types';

/** First upcoming session (museum: opening of the first day on sale), used to order the moderation queue. */
export function firstSession(ev: EventItem): number | null {
  if (ev.kind === 'museum') {
    if (!ev.museum) return null;
    for (let i = 0; i <= (ev.museum.ahead || 30); i++) {
      const dd = addDays(todayKey(), i);
      if (museumDay(ev, dd).open) return tkMs(dd, dayCfg(ev, dd).h?.open || '09:00');
    }
    return null;
  }
  const s = eventSessions(ev.id).find((x) => x.startsAt > now());
  return s ? s.startsAt : null;
}
