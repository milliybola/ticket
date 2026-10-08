/* Venue contact block shared by the event, session and venue pages. */
import { ExternalLink, Globe, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router';
import type { ItVenue, ItVenueShort } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';

export const mapsUrl = (lat: string | number | null | undefined, lng: string | number | null | undefined, q?: string) =>
  lat && lng && Number(lat) && Number(lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';

export const telHref = (p: string) => 'tel:' + p.replace(/[^\d+]/g, '');

export function VenueInfo({ venue, link = true }: { venue: ItVenueShort | ItVenue; link?: boolean }) {
  const { t3 } = useI18n();
  const v = venue as ItVenue;
  const map = mapsUrl(v.map_lat, v.map_lng, v.address ? `${v.name}, ${v.address}` : undefined);
  const phones = [...new Set([v.phone, v.mobile].filter(Boolean) as string[])];
  return (
    <div className="flex flex-col gap-2.5 text-[15px]">
      <div className="font-bold text-ink">{link && v.slug ? <Link to={`/venues/${v.slug}`} className="hover:underline">{v.name}</Link> : v.name}</div>
      {v.address && (
        <div className="flex gap-2 text-ink-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <span>{v.address}</span>
        </div>
      )}
      {phones.map((p) => (
        <a key={p} href={telHref(p)} className="flex items-center gap-2 text-ink-2 hover:text-ink">
          <Phone className="size-4 shrink-0 text-ink-3" />
          {p}
        </a>
      ))}
      {v.website && (
        <a href={/^https?:/.test(v.website) ? v.website : 'https://' + v.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-ink-2 hover:text-ink">
          <Globe className="size-4 shrink-0 text-ink-3" />
          <span className="truncate">{v.website.replace(/^https?:\/\//, '')}</span>
        </a>
      )}
      {map && (
        <a href={map} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-black/5 px-3 py-2 text-sm font-semibold hover:bg-black/10">
          <MapPin className="size-4" /> {t3('Xaritada koʻrish', 'Открыть на карте', 'Open in Google Maps')} <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}
