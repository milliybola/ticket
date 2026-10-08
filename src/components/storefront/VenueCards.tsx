/* Venue cards: iticket.uz venues and venues of Sayohat organizers. */
import { Building2, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router';
import type { ItVenue } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { cityName, evTitle, storefrontEvents } from '../../domain/rules';
import { localEventUrl } from '../../domain/storefront';
import type { Venue } from '../../domain/types';
import { Card } from '../ui';
import { mapsUrl } from './VenueInfo';

export const hasImg = (u?: string) => !!u && !/no-(poster|cover|icon)\./.test(u);

export function ItVenueCard({ v }: { v: ItVenue }) {
  const { t3 } = useI18n();
  return (
    <Link to={`/venues/${v.slug}`} className="group flex gap-4 rounded-[var(--radius-card)] bg-white p-3 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-page md:size-24">
        {hasImg(v.poster_url) ? <img src={v.poster_url} alt={v.name} loading="lazy" className="size-full object-cover" /> : <Building2 className="size-8 text-ink-3" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <div className="line-clamp-2 font-bold group-hover:underline">{v.name}</div>
        {v.address && (
          <div className="mt-1 flex gap-1.5 text-sm text-ink-3">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{v.address}</span>
          </div>
        )}
        {v.phone && (
          <div className="mt-1 flex items-center gap-1.5 text-sm text-ink-3">
            <Phone className="size-3.5 shrink-0" />
            {v.phone}
          </div>
        )}
        {!v.address && !v.phone && <div className="mt-1 text-sm text-ink-3">{t3('Afishani koʻrish', 'Смотреть афишу', 'See events')}</div>}
      </div>
    </Link>
  );
}

export function LocalVenueCard({ v }: { v: Venue }) {
  const { t3 } = useI18n();
  const evs = storefrontEvents().filter((e) => e.venueId === v.id);
  const map = v.point ? mapsUrl(v.point.lat, v.point.lng) : mapsUrl(null, null, `${v.name}, ${v.address}, ${cityName(v.city)}`);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold">{v.name}</div>
        <span className="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">Sayohat</span>
      </div>
      <div className="flex gap-1.5 text-sm text-ink-3">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {cityName(v.city)}
          {v.address && `, ${v.address}`}
        </span>
      </div>
      {evs.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1 text-[15px]">
          {evs.slice(0, 4).map((e) => (
            <li key={e.id}>
              <Link to={localEventUrl(e.id)} className="font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                {evTitle(e)}
              </Link>
            </li>
          ))}
          {evs.length > 4 && <li className="text-sm text-ink-3">{t3('va yana {n} ta', 'и ещё {n}', 'and {n} more', { n: evs.length - 4 })}</li>}
        </ul>
      ) : (
        <div className="text-sm text-ink-3">{t3('Hozircha sotuvda tadbir yoʻq', 'Сейчас нет событий в продаже', 'No events on sale right now')}</div>
      )}
      {map && (
        <a href={map} target="_blank" rel="noopener noreferrer" className="mt-auto w-fit pt-1 text-sm font-semibold underline">
          {t3('Xaritada koʻrish', 'Открыть на карте', 'Open in Google Maps')}
        </a>
      )}
    </Card>
  );
}
