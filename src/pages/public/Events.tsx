/* /events and /events/:category — iticket.uz listing (all pages) merged with Sayohat events, client-side filters. */
import { clsx } from 'clsx';
import { CalendarDays, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useItAllEvents, useItCategories } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { todayKey } from '../../lib/time';
import { storefrontEvents } from '../../domain/rules';
import { isLocalCategory, kindsForCategory, LOCAL_CATEGORIES } from '../../domain/storefront';
import { useDb } from '../../store/db';
import { Button, Empty, Input, LinkButton, Notice, Select } from '../../components/ui';
import { CardGrid } from '../../components/storefront/EventCard';
import { filterDays, fromIt, fromLocal, matchesDays, type CardItem, type DateFilter } from '../../components/storefront/model';

type Sort = 'date' | 'price-asc' | 'price-desc';

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={clsx('h-10 shrink-0 rounded-full px-4 text-[15px] font-medium whitespace-nowrap transition-colors', on ? 'bg-brand font-semibold text-ink' : 'bg-white text-ink-2 shadow-[var(--shadow-card)] hover:text-ink')}>
      {children}
    </button>
  );
}

export default function Events() {
  const { t3, tl } = useI18n();
  const { category } = useParams();
  const localOnly = isLocalCategory(category);
  const cats = useItCategories();
  const q = useItAllEvents({ category_slug: category }, category ? 8 : 12, !localOnly);
  const itQ = localOnly ? null : q;
  useDb();

  const [when, setWhen] = useState<DateFilter>('');
  const [picked, setPicked] = useState('');
  const [venue, setVenue] = useState('');
  const [pmin, setPmin] = useState('');
  const [pmax, setPmax] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const [showFilters, setShowFilters] = useState(false);

  const title = useMemo(() => {
    if (!category) return t3('Barcha tadbirlar', 'Все события', 'All events');
    const local = LOCAL_CATEGORIES.find((c) => c.slug === category);
    if (local) return tl(local.name);
    const fromResp = itQ?.data && !Array.isArray(itQ.data.category) ? itQ.data.category.name : undefined;
    return fromResp || cats.data?.find((c) => c.slug === category)?.name || category;
  }, [category, itQ?.data, cats.data, t3, tl]);

  const kinds = kindsForCategory(category);
  // events imported from iticket belong to their iticket category; events created here go by kind
  const localItems: CardItem[] = storefrontEvents()
    .filter((e) => !category || (e.ext?.category ? e.ext.category === category : !kinds || kinds.includes(e.kind)))
    .map(fromLocal);
  const itItems: CardItem[] = useMemo(() => (itQ?.data ? itQ.data.events.data.map(fromIt) : []), [itQ?.data]);
  const all = [...localItems, ...itItems].filter((it, i, arr) => arr.findIndex((x) => x.key === it.key) === i);

  const venueSet = new Set<string>();
  for (const v of itQ?.data?.venues || []) venueSet.add(v.name);
  for (const it of all) it.venues.forEach((v) => venueSet.add(v));
  const venueNames = [...venueSet].sort((a, b) => a.localeCompare(b));

  const days = filterDays(when, picked);
  const lo = pmin ? Number(pmin) : null;
  const hi = pmax ? Number(pmax) : null;
  const list = all
    .filter((it) => matchesDays(it, days))
    .filter((it) => !venue || it.venues.includes(venue))
    .filter((it) => (lo == null || (it.price ?? 0) >= lo) && (hi == null || (it.price ?? 0) <= hi))
    .sort((a, b) => {
      if (sort === 'date') return a.start - b.start;
      const pa = a.price ?? Infinity;
      const pb = b.price ?? Infinity;
      return sort === 'price-asc' ? pa - pb : (b.price ?? -1) - (a.price ?? -1);
    });
  const active = !!(when || venue || pmin || pmax);
  const reset = () => {
    setWhen('');
    setPicked('');
    setVenue('');
    setPmin('');
    setPmax('');
  };

  const loading = !!itQ?.isLoading;
  const failed = !!itQ?.isError;
  const notFound = failed && (itQ?.error as { status?: number } | null)?.status === 404;

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-5 md:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight md:text-[40px]">{title}</h1>
        {!loading && <div className="pb-1 text-ink-3">{t3('{n} ta tadbir', '{n} событий', '{n} events', { n: list.length })}</div>}
      </div>

      {/* filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:w-auto sm:px-0">
          <Chip on={!when} onClick={() => setWhen('')}>
            {t3('Istalgan sana', 'Любая дата', 'Any date')}
          </Chip>
          <Chip on={when === 'today'} onClick={() => setWhen('today')}>
            {t3('Bugun', 'Сегодня', 'Today')}
          </Chip>
          <Chip on={when === 'tomorrow'} onClick={() => setWhen('tomorrow')}>
            {t3('Ertaga', 'Завтра', 'Tomorrow')}
          </Chip>
          <Chip on={when === 'weekend'} onClick={() => setWhen('weekend')}>
            {t3('Dam olish kunlari', 'Выходные', 'Weekend')}
          </Chip>
          <label className={clsx('relative flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-[15px] font-medium', when === 'date' ? 'bg-brand font-semibold' : 'bg-white text-ink-2 shadow-[var(--shadow-card)]')}>
            <CalendarDays className="size-4" />
            <span>{when === 'date' && picked ? picked.split('-').reverse().join('.') : t3('Sanani tanlash', 'Выбрать дату', 'Pick a date')}</span>
            <input
              type="date"
              min={todayKey()}
              value={picked}
              onChange={(e) => {
                setPicked(e.target.value);
                setWhen(e.target.value ? 'date' : '');
              }}
              aria-label={t3('Sanani tanlash', 'Выбрать дату', 'Pick a date')}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
        <Button variant="outline" size="sm" className="h-10 rounded-full md:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <SlidersHorizontal className="size-4" /> {t3('Filtrlar', 'Фильтры', 'Filters')}
        </Button>
        {active && (
          <Button variant="ghost" size="sm" className="h-10 rounded-full" onClick={reset}>
            <X className="size-4" /> {t3('Tozalash', 'Сбросить', 'Reset')}
          </Button>
        )}
      </div>
      <div className={clsx('mt-3 grid-cols-2 gap-2 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:gap-3', showFilters ? 'grid' : 'hidden')}>
        <Select className="col-span-2 md:col-span-1" value={venue} onChange={(e) => setVenue(e.target.value)} aria-label={t3('Joy', 'Площадка', 'Venue')}>
          <option value="">{t3('Barcha joylar', 'Все площадки', 'All venues')}</option>
          {venueNames.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        <Input type="number" inputMode="numeric" min={0} step={1000} value={pmin} onChange={(e) => setPmin(e.target.value)} placeholder={t3('Narx, dan', 'Цена от', 'Price from')} aria-label={t3('Narx, dan', 'Цена от', 'Price from')} />
        <Input type="number" inputMode="numeric" min={0} step={1000} value={pmax} onChange={(e) => setPmax(e.target.value)} placeholder={t3('Narx, gacha', 'Цена до', 'Price to')} aria-label={t3('Narx, gacha', 'Цена до', 'Price to')} />
        <Select className="col-span-2 md:col-span-1" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t3('Saralash', 'Сортировка', 'Sort')}>
          <option value="date">{t3('Sana boʻyicha', 'По дате', 'By date')}</option>
          <option value="price-asc">{t3('Avval arzonlari', 'Сначала дешевле', 'Cheapest first')}</option>
          <option value="price-desc">{t3('Avval qimmatlari', 'Сначала дороже', 'Most expensive first')}</option>
        </Select>
      </div>

      {failed && !notFound && (
        <Notice
          tone="warn"
          className="mt-6"
          title={t3('iticket.uz tadbirlari yuklanmadi', 'Не удалось загрузить события iticket.uz', 'Could not load iticket.uz events')}
          action={
            <Button size="sm" variant="dark" onClick={() => itQ?.refetch()}>
              <RefreshCw className="size-4" /> {t3('Qayta urinish', 'Повторить', 'Retry')}
            </Button>
          }
        />
      )}

      <div className="mt-6 md:mt-8">
        {loading && !localItems.length ? (
          <CardGrid items={[]} loading />
        ) : list.length ? (
          <>
            <CardGrid items={list} />
            {loading && (
              <div className="mt-8">
                <CardGrid items={[]} loading skeletons={5} />
              </div>
            )}
          </>
        ) : loading ? (
          <CardGrid items={[]} loading />
        ) : (
          <Empty
            title={notFound ? t3('Boʻlim topilmadi', 'Раздел не найден', 'Category not found') : t3('Hech narsa topilmadi', 'Ничего не найдено', 'Nothing found')}
            action={
              active ? (
                <Button variant="dark" onClick={reset}>
                  {t3('Filtrlarni tozalash', 'Сбросить фильтры', 'Reset filters')}
                </Button>
              ) : (
                <LinkButton to="/events" variant="dark">
                  {t3('Barcha tadbirlar', 'Все события', 'All events')}
                </LinkButton>
              )
            }
          >
            {active ? t3('Boshqa sana, joy yoki narxni tanlab koʻring.', 'Попробуйте другую дату, площадку или цену.', 'Try another date, venue or price.') : t3('Bu boʻlimda hozircha tadbirlar yoʻq.', 'В этом разделе пока нет событий.', 'There are no events in this category yet.')}
          </Empty>
        )}
      </div>
    </div>
  );
}
