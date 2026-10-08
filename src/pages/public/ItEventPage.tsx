/* /events/:category/:slug — an iticket.uz event: hero, description, sessions with "Chipta olish", gallery, venue, similar. */
import { clsx } from 'clsx';
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useDb } from '../../store/db';
import { itSiteUrl, useItEvent, type ItEvent, type ItSession } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { dateKey, DOW_LONG, hhmm, MONTHS_GEN, parseApiDate, tk } from '../../lib/time';
import { usd } from '../../lib/format';
import { Badge, Button, Card, Empty, LinkButton, Notice } from '../../components/ui';
import { CardRow } from '../../components/storefront/EventCard';
import { fromIt, itWhen, priceFrom } from '../../components/storefront/model';
import { sanitizeHtml } from '../../components/storefront/sanitize';
import { VenueInfo } from '../../components/storefront/VenueInfo';

function galleryUrls(ev: ItEvent): string[] {
  const g = (ev.gallery || []) as unknown[];
  return g.map((x) => (typeof x === 'string' ? x : (x as { url?: string; image_url?: string })?.url || (x as { image_url?: string })?.image_url || '')).filter(Boolean);
}

function SessionRow({ s, ev, base }: { s: ItSession; ev: ItEvent; base: string }) {
  const { t3, lang } = useI18n();
  const a = parseApiDate(s.session_starts_at);
  const b = parseApiDate(s.session_ends_at);
  const p = tk(a);
  const soldOut = s.available_tickets_count === 0;
  const multiDay = Number.isFinite(b) && dateKey(a) !== dateKey(b);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] md:flex-nowrap md:p-5">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-page py-2 text-center">
        <span className="text-2xl leading-none font-extrabold">{p.d}</span>
        <span className="mt-1 text-xs font-semibold text-ink-3">{MONTHS_GEN[lang][p.m - 1].slice(0, 3)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold">
          <span className="capitalize">{DOW_LONG[lang][p.dow]}</span>, {hhmm(a)}
          {Number.isFinite(b) && !multiDay && b > a && <span className="font-normal text-ink-3"> – {hhmm(b)}</span>}
        </div>
        {multiDay && <div className="text-sm text-ink-2">{itWhen(s.session_starts_at, s.session_ends_at)}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {s.venue?.name}
          </span>
          {s.session_lang_label && <span>{s.session_lang_label}</span>}
          {!soldOut && s.available_tickets_count > 0 && <span>{t3('{n} ta chipta qoldi', 'Осталось билетов: {n}', '{n} tickets left', { n: s.available_tickets_count })}</span>}
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-4 md:w-auto">
        {!soldOut && s.min_price > 0 && (
          <div className="text-right">
            <div className="font-bold whitespace-nowrap">{priceFrom(s.min_price)}</div>
            <div className="text-xs text-ink-3">{usd(s.min_price)}</div>
          </div>
        )}
        {soldOut ? (
          <Badge tone="neutral" className="px-3 py-1.5 text-sm">
            {t3('Chiptalar sotilgan', 'Билеты распроданы', 'Sold out')}
          </Badge>
        ) : ev.external_url ? (
          <a href={ev.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold hover:bg-brand-hover">
            {t3('Chipta olish', 'Купить билет', 'Get tickets')} <ExternalLink className="size-4" />
          </a>
        ) : (
          <LinkButton to={`${base}/${s.id}`}>{t3('Chipta olish', 'Купить билет', 'Get tickets')}</LinkButton>
        )}
      </div>
    </li>
  );
}

/** Imported events are sold here: their Sayohat page shows the same data as the organizer's cabinet. */
export default function ItEventPage() {
  const { category, slug } = useParams();
  const db = useDb();
  const local = db.events.find((e) => e.ext?.slug === slug && e.ext?.category === category);
  if (local) return <Navigate to={`/e/${local.id}`} replace />;
  return <ItEventLive />;
}

/** Events that are not imported (sold on an external site) keep the live iticket page. */
function ItEventLive() {
  const { t3, lang } = useI18n();
  const { category, slug } = useParams();
  const q = useItEvent(category, slug);
  const [allSessions, setAllSessions] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  if (q.isLoading)
    return (
      <div className="mx-auto max-w-[1280px] animate-pulse px-4 pt-6 lg:px-5">
        <div className="h-56 rounded-[var(--radius-card)] bg-line md:h-96" />
        <div className="mt-6 h-8 w-2/3 rounded bg-line" />
        <div className="mt-3 h-4 w-1/3 rounded bg-line" />
      </div>
    );
  if (q.isError || !q.data) {
    const nf = (q.error as { status?: number } | null)?.status === 404;
    return (
      <Empty
        className="min-h-[50vh]"
        title={nf ? t3('Tadbir topilmadi', 'Событие не найдено', 'Event not found') : t3('Tadbir yuklanmadi', 'Не удалось загрузить событие', 'Could not load the event')}
        action={
          nf ? (
            <LinkButton to="/events" variant="dark">
              {t3('Barcha tadbirlar', 'Все события', 'All events')}
            </LinkButton>
          ) : (
            <Button variant="dark" onClick={() => q.refetch()}>
              {t3('Qayta urinish', 'Повторить', 'Retry')}
            </Button>
          )
        }
      >
        {nf ? t3('Ehtimol, u oʻtib ketgan yoki havola notoʻgʻri.', 'Возможно, оно уже прошло или ссылка неверна.', 'It may be over, or the link is wrong.') : t3('Internet aloqasini tekshiring.', 'Проверьте подключение к интернету.', 'Check your connection.')}
      </Empty>
    );
  }

  const ev = q.data;
  const base = `/events/${category}/${slug}`;
  const cover = ev.poster_wide_bg_url || ev.cover_url || ev.poster_wide_url;
  const sessions = [...(ev.sessions || [])].sort((a, b) => parseApiDate(a.session_starts_at) - parseApiDate(b.session_starts_at));
  const shown = allSessions ? sessions : sessions.slice(0, 8);
  const gallery = galleryUrls(ev);
  const desc = sanitizeHtml(ev.description);
  const soldOut = ev.available_tickets_count === 0;
  const venues = ev.venues || [];
  const scrollToSessions = () => document.getElementById('sessions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-4 lg:px-5 md:pt-6">
      <Link to={`/events/${ev.category_slug || category}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> {t3('Orqaga', 'Назад', 'Back')}
      </Link>

      {/* hero */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-ink text-white">
        {cover && <img src={cover} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
        <div className="relative flex flex-col gap-6 p-5 pt-28 md:flex-row md:items-end md:p-10 md:pt-40">
          <img src={ev.poster_url} alt={ev.name} style={ev.poster_bg_url ? { backgroundImage: `url(${ev.poster_bg_url})`, backgroundSize: 'cover' } : undefined} className="hidden aspect-[470/518] w-56 shrink-0 rounded-[var(--radius-card)] object-cover shadow-2xl md:block" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {ev.age_limit && <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-sm font-bold text-ink">{ev.age_limit}</span>}
              {soldOut && <span className="rounded-full bg-bad px-2.5 py-0.5 text-sm font-bold">{t3('Chiptalar sotilgan', 'Билеты распроданы', 'Sold out')}</span>}
            </div>
            <h1 className="mt-3 text-[28px] leading-tight font-extrabold tracking-tight md:text-5xl" style={{ textWrap: 'balance' }}>
              {ev.name}
            </h1>
            {ev.headline && <p className="mt-2 max-w-2xl text-white/85">{ev.headline}</p>}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-white/90">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4" /> {itWhen(ev.event_starts_at, ev.event_ends_at)}
              </span>
              {venues.length > 0 && (
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4" /> {venues.map((v) => v.name).join(', ')}
                </span>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              {ev.external_url ? (
                <a href={ev.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-brand px-7 font-semibold text-ink hover:bg-brand-hover">
                  <Ticket className="size-5" /> {t3('Chipta olish', 'Купить билет', 'Get tickets')} <ExternalLink className="size-4" />
                </a>
              ) : sessions.length === 1 && !soldOut ? (
                <LinkButton to={`${base}/${sessions[0].id}`} className="h-12 rounded-2xl px-7">
                  <Ticket className="size-5" /> {t3('Chipta olish', 'Купить билет', 'Get tickets')}
                </LinkButton>
              ) : (
                <Button onClick={scrollToSessions} disabled={!sessions.length} className="h-12 rounded-2xl px-7">
                  <Ticket className="size-5" /> {t3('Chipta olish', 'Купить билет', 'Get tickets')}
                </Button>
              )}
              {ev.min_price > 0 && !soldOut && (
                <div>
                  <div className="text-lg font-bold">{priceFrom(ev.min_price)}</div>
                  <div className="text-sm text-white/70">{usd(ev.min_price)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="min-w-0">
          {/* sessions */}
          <section id="sessions" className="scroll-mt-24">
            <h2 className="text-xl font-bold md:text-2xl">{t3('Seanslar', 'Сеансы', 'Sessions')}</h2>
            {sessions.length ? (
              <>
                <ul className="mt-4 flex flex-col gap-3">
                  {shown.map((s) => (
                    <SessionRow key={s.id} s={s} ev={ev} base={base} />
                  ))}
                </ul>
                {sessions.length > shown.length && (
                  <Button variant="outline" className="mt-4" onClick={() => setAllSessions(true)}>
                    {t3('Yana {n} ta seans', 'Ещё {n} сеансов', '{n} more sessions', { n: sessions.length - shown.length })}
                  </Button>
                )}
              </>
            ) : (
              <Notice tone="neutral" className="mt-4">
                {t3('Hozircha sotuvda seanslar yoʻq.', 'Сейчас нет сеансов в продаже.', 'No sessions on sale right now.')}{' '}
                <a href={itSiteUrl(lang, base)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  iticket.uz
                </a>
              </Notice>
            )}
          </section>

          {/* description */}
          {desc && (
            <section className="mt-10">
              <h2 className="text-xl font-bold md:text-2xl">{t3('Tadbir haqida', 'О событии', 'About the event')}</h2>
              <div className="prose-it mt-4" dangerouslySetInnerHTML={{ __html: desc }} />
            </section>
          )}

          {/* gallery */}
          {gallery.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold md:text-2xl">{t3('Galereya', 'Галерея', 'Gallery')}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {gallery.map((g, i) => (
                  <button key={g} type="button" onClick={() => setZoom(g)} className="overflow-hidden rounded-2xl" aria-label={t3('Rasmni kattalashtirish', 'Увеличить фото', 'Enlarge photo') + ` ${i + 1}`}>
                    <img src={g} alt={`${ev.name} — ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-105" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* side: venues */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {venues.map((v) => (
            <Card key={v.id}>
              <div className="mb-3 text-sm font-semibold text-ink-3">{t3('Oʻtkaziladigan joy', 'Место проведения', 'Venue')}</div>
              <VenueInfo venue={v} />
            </Card>
          ))}
          <Card className={clsx('bg-brand-soft shadow-none')}>
            <div className="text-sm text-ink-2">
              {t3(
                'Chiptalar iticket.uz tomonidan sotiladi. Sayohat joylarning jonli holatini koʻrsatadi, xarid iticket.uz’da yakunlanadi.',
                'Билеты продаёт iticket.uz. Sayohat показывает наличие мест в реальном времени, покупка завершается на iticket.uz.',
                'Tickets are sold by iticket.uz. Sayohat shows live availability; the purchase completes on iticket.uz.',
              )}
            </div>
          </Card>
        </aside>
      </div>

      {/* similar */}
      {ev.similar?.length > 0 && <CardRow title={t3('Oʻxshash tadbirlar', 'Похожие события', 'Similar events')} items={ev.similar.map(fromIt)} />}

      {zoom && (
        <div role="dialog" aria-modal className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-4" onClick={() => setZoom(null)} onKeyDown={(e) => e.key === 'Escape' && setZoom(null)}>
          <img src={zoom} alt={ev.name} className="max-h-[90vh] max-w-full rounded-2xl object-contain" />
          <button type="button" autoFocus onClick={() => setZoom(null)} className="absolute top-4 right-4 rounded-full bg-white/90 px-4 py-2 font-semibold text-ink">
            {t3('Yopish', 'Закрыть', 'Close')}
          </button>
        </div>
      )}
    </div>
  );
}
