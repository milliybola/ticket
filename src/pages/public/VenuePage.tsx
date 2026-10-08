/* /venues/:slug — an iticket.uz venue: cover, contacts, map link, description and its events. */
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useItAllEvents, useItVenue } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { Button, Card, Empty, LinkButton } from '../../components/ui';
import { CardGrid } from '../../components/storefront/EventCard';
import { fromIt } from '../../components/storefront/model';
import { sanitizeHtml } from '../../components/storefront/sanitize';
import { hasImg } from '../../components/storefront/VenueCards';
import { VenueInfo } from '../../components/storefront/VenueInfo';

const COLS = 'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 md:gap-x-5';

export default function VenuePage() {
  const { t3 } = useI18n();
  const { slug } = useParams();
  const q = useItVenue(slug);
  const v = q.data;
  const evQ = useItAllEvents({ venue_id: v?.id }, 4, !!v?.id);

  if (q.isLoading)
    return (
      <div className="mx-auto max-w-[1280px] animate-pulse px-4 pt-6 lg:px-5">
        <div className="h-48 rounded-[var(--radius-card)] bg-line md:h-72" />
        <div className="mt-6 h-8 w-1/2 rounded bg-line" />
      </div>
    );
  if (q.isError || !v) {
    const nf = (q.error as { status?: number } | null)?.status === 404;
    return (
      <Empty
        className="min-h-[50vh]"
        title={nf ? t3('Joy topilmadi', 'Площадка не найдена', 'Venue not found') : t3('Joy yuklanmadi', 'Не удалось загрузить площадку', 'Could not load the venue')}
        action={
          nf ? (
            <LinkButton to="/venues" variant="dark">
              {t3('Barcha joylar', 'Все площадки', 'All venues')}
            </LinkButton>
          ) : (
            <Button variant="dark" onClick={() => q.refetch()}>
              {t3('Qayta urinish', 'Повторить', 'Retry')}
            </Button>
          )
        }
      />
    );
  }

  const cover = hasImg(v.cover_url) ? v.cover_url : hasImg(v.poster_url) ? v.poster_url : '';
  const desc = sanitizeHtml(v.description);
  const events = (evQ.data?.events.data || []).map(fromIt).sort((a, b) => a.start - b.start);

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-4 lg:px-5 md:pt-6">
      <Link to="/venues" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> {t3('Barcha joylar', 'Все площадки', 'All venues')}
      </Link>
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-ink text-white">
        {cover && <img src={cover} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/10" />
        <div className="relative p-5 pt-24 md:p-10 md:pt-36">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight md:text-5xl">{v.name}</h1>
          {v.headline && <p className="mt-2 max-w-2xl text-white/85">{v.headline}</p>}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <h2 className="text-xl font-bold md:text-2xl">{t3('Afisha', 'Афиша', 'Events')}</h2>
          <div className="mt-4">
            {evQ.isLoading ? (
              <CardGrid items={[]} loading skeletons={4} className={COLS} />
            ) : events.length ? (
              <CardGrid items={events} className={COLS} />
            ) : (
              <Empty title={t3('Hozircha tadbirlar yoʻq', 'Пока нет событий', 'No events yet')} className="rounded-[var(--radius-card)] bg-white">
                {t3('Bu joyda sotuvdagi tadbirlar paydo boʻlganda shu yerda koʻrinadi.', 'Когда здесь появятся события в продаже, они будут показаны тут.', 'Events on sale at this venue will appear here.')}
              </Empty>
            )}
          </div>
          {desc && (
            <section className="mt-10">
              <h2 className="text-xl font-bold md:text-2xl">{t3('Joy haqida', 'О площадке', 'About the venue')}</h2>
              <div className="prose-it mt-4" dangerouslySetInnerHTML={{ __html: desc }} />
            </section>
          )}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <div className="mb-3 text-sm font-semibold text-ink-3">{t3('Aloqa', 'Контакты', 'Contacts')}</div>
            <VenueInfo venue={v} link={false} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
