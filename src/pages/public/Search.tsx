/* /search?q= — iticket.uz search (events + venues) plus Sayohat events matching the title (any language) or venue. */
import { Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useItSearch } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { getVenue, storefrontEvents } from '../../domain/rules';
import { useDb } from '../../store/db';
import { Button, Empty, Notice } from '../../components/ui';
import { CardGrid } from '../../components/storefront/EventCard';
import { fromIt, fromLocal } from '../../components/storefront/model';
import { ItVenueCard } from '../../components/storefront/VenueCards';

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ‘’`']/g, '').trim();

export default function Search() {
  const { t3 } = useI18n();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [text, setText] = useState(q);
  useDb();

  useEffect(() => {
    setText((t) => (t.trim() === q ? t : q));
  }, [q]);
  useEffect(() => {
    if (text === q) return;
    const id = window.setTimeout(() => setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }), 350);
    return () => window.clearTimeout(id);
  }, [text, q, setParams]);

  const it = useItSearch(q);
  const nq = norm(q);
  const local =
    nq.length >= 2
      ? storefrontEvents()
          .filter((e) => [...Object.values(e.card.title), getVenue(e.venueId)?.name || ''].some((s) => norm(String(s)).includes(nq)))
          .map(fromLocal)
      : [];
  const events = [...local, ...(it.data?.events || []).map(fromIt)];
  const venues = it.data?.venues || [];
  const tooShort = q.trim().length < 2;
  const loading = !tooShort && (it.isLoading || (it.isFetching && it.isPlaceholderData));

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-5 md:pt-10">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight md:text-[40px]">{t3('Qidiruv', 'Поиск', 'Search')}</h1>
      <form
        role="search"
        className="mt-5 flex h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-[var(--shadow-card)] focus-within:ring-2 focus-within:ring-ink"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
        }}
      >
        <SearchIcon className="size-5 shrink-0 text-ink-3" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t3('Tadbir, ijrochi yoki joyni qidiring', 'Поиск мероприятий, артистов, площадок', 'Search events, artists, venues')}
          aria-label={t3('Qidiruv', 'Поиск', 'Search')}
          className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none"
        />
        {text && (
          <button type="button" onClick={() => setText('')} className="grid size-9 place-items-center rounded-full hover:bg-black/5" aria-label={t3('Tozalash', 'Очистить', 'Clear')}>
            <X className="size-5" />
          </button>
        )}
      </form>

      {tooShort ? (
        <Empty title={t3('Nimani qidiryapsiz?', 'Что ищем?', 'What are you looking for?')} className="mt-6">
          {t3('Kamida 2 ta harf kiriting: tadbir nomi, ijrochi yoki joy.', 'Введите хотя бы 2 буквы: название, артиста или площадку.', 'Type at least 2 letters: an event, artist or venue.')}
        </Empty>
      ) : (
        <>
          {it.isError && (
            <Notice tone="warn" className="mt-6" action={<Button size="sm" variant="dark" onClick={() => it.refetch()}>{t3('Qayta urinish', 'Повторить', 'Retry')}</Button>}>
              {t3('iticket.uz qidiruvi ishlamadi, faqat Sayohat natijalari koʻrsatilmoqda.', 'Поиск iticket.uz не ответил, показаны только результаты Sayohat.', 'iticket.uz search failed; showing Sayohat results only.')}
            </Notice>
          )}
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold md:text-2xl">
              {t3('Tadbirlar', 'События', 'Events')} {!loading && <span className="text-ink-3">{events.length}</span>}
            </h2>
            {loading && !events.length ? (
              <CardGrid items={[]} loading skeletons={5} />
            ) : events.length ? (
              <CardGrid items={events} />
            ) : (
              <div className="text-ink-3">{t3('«{q}» boʻyicha tadbir topilmadi.', 'По запросу «{q}» событий нет.', 'No events for “{q}”.', { q })}</div>
            )}
          </section>
          {venues.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 text-xl font-bold md:text-2xl">
                {t3('Joylar', 'Площадки', 'Venues')} <span className="text-ink-3">{venues.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {venues.map((v) => (
                  <ItVenueCard key={v.id} v={v} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
