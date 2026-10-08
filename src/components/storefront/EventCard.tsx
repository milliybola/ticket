/* Poster cards of the storefront (iticket.uz look): portrait poster with 20px corners, then name, date, venue, price. */
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { usd } from '../../lib/format';
import { Poster } from '../common';
import { kindLabel, priceFrom, type CardItem } from './model';

export function EventCard({ item, className, large }: { item: CardItem; className?: string; large?: boolean }) {
  const { t3 } = useI18n();
  const body = (
    <>
      <div className={clsx('relative overflow-hidden rounded-[var(--radius-card)] bg-line', 'aspect-[470/518]')}>
        {item.img ? (
          <img src={item.img} alt={item.title} loading="lazy" style={item.imgBg ? { backgroundImage: `url(${item.imgBg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} className={clsx('size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]', item.soldOut && 'grayscale-[60%]')} />
        ) : item.poster ? (
          <Poster card={item.poster} className="transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : null}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {item.kind && <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-bold text-ink">{kindLabel(item.kind)}</span>}
          {item.source === 'local' && <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">Sayohat</span>}
        </div>
        {item.age && <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-ink">{item.age}</span>}
        {item.soldOut && (
          <span className="absolute inset-x-3 bottom-3 rounded-xl bg-ink/85 py-1.5 text-center text-sm font-semibold text-white">{t3('Chiptalar sotilgan', 'Билеты распроданы', 'Sold out')}</span>
        )}
      </div>
      <div className="mt-3 px-0.5">
        <h3 className={clsx('line-clamp-2 leading-snug font-bold text-ink', large ? 'text-lg' : 'text-[15px] md:text-base')}>{item.title}</h3>
        {item.when && <div className="mt-1 text-sm text-ink-2">{item.when}</div>}
        {(item.venue || item.city) && <div className="mt-0.5 line-clamp-1 text-sm text-ink-3">{[item.venue, item.city].filter(Boolean).join(', ')}</div>}
        {item.price != null && !item.soldOut && (
          <div className="mt-1.5 text-[15px] font-bold text-ink">
            {priceFrom(item.price)} <span className="text-xs font-normal text-ink-3">{usd(item.price)}</span>
          </div>
        )}
      </div>
    </>
  );
  const cls = clsx('group block min-w-0 rounded-[var(--radius-card)] outline-offset-4', className);
  return item.external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link to={item.href} className={cls}>
      {body}
    </Link>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('animate-pulse', className)} aria-hidden>
      <div className="aspect-[470/518] rounded-[var(--radius-card)] bg-line" />
      <div className="mt-3 h-4 w-4/5 rounded bg-line" />
      <div className="mt-2 h-3 w-1/2 rounded bg-line" />
      <div className="mt-2 h-3 w-2/3 rounded bg-line" />
    </div>
  );
}

/** iticket sometimes lists the same event twice in one block or across pages. */
const uniqueByKey = (items: CardItem[]) => items.filter((it, i) => items.findIndex((x) => x.key === it.key) === i);

export const GRID = 'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 md:gap-x-5 lg:grid-cols-4 xl:grid-cols-5';

export function CardGrid({ items, loading, skeletons = 10, className }: { items: CardItem[]; loading?: boolean; skeletons?: number; className?: string }) {
  return <div className={className || GRID}>{loading ? Array.from({ length: skeletons }, (_, i) => <CardSkeleton key={i} />) : uniqueByKey(items).map((it) => <EventCard key={it.key} item={it} />)}</div>;
}

/** Titled horizontal row with arrow buttons on desktop and touch scrolling on phones. */
export function Scroller({ title, action, children, className, itemsKey }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; itemsKey?: string | number }) {
  const { t3 } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: true, right: false });
  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft <= 4, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    check();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [check, itemsKey]);
  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className={clsx('mt-10 md:mt-14', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4 md:mb-5">
          {title && <h2 className="text-xl font-bold tracking-tight md:text-[28px]">{title}</h2>}
          <div className="flex items-center gap-2">
            {action}
            <div className="hidden gap-2 md:flex">
              <button type="button" onClick={() => go(-1)} disabled={edge.left} aria-label={t3('Orqaga', 'Назад', 'Previous')} className="grid size-10 place-items-center rounded-full bg-white shadow-[var(--shadow-card)] transition hover:bg-brand disabled:opacity-40 disabled:hover:bg-white">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={() => go(1)} disabled={edge.right} aria-label={t3('Oldinga', 'Вперёд', 'Next')} className="grid size-10 place-items-center rounded-full bg-white shadow-[var(--shadow-card)] transition hover:bg-brand disabled:opacity-40 disabled:hover:bg-white">
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>
        </div>
      )}
      <div ref={ref} onScroll={check} className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:gap-5 lg:mx-0 lg:scroll-px-0 lg:px-0">
        {children}
      </div>
    </section>
  );
}

/** Width of a card inside a Scroller. */
export const ROW_ITEM = 'w-[44%] shrink-0 snap-start sm:w-[30%] lg:w-[calc((100%-4*20px)/5)]';
export const ROW_ITEM_LARGE = 'w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-3*20px)/4)]';

export function CardRow({ title, items, large, action }: { title: ReactNode; items: CardItem[]; large?: boolean; action?: ReactNode }) {
  if (!items.length) return null;
  return (
    <Scroller title={title} action={action} itemsKey={items.length}>
      {uniqueByKey(items).map((it) => (
        <EventCard key={it.key} item={it} large={large} className={large ? ROW_ITEM_LARGE : ROW_ITEM} />
      ))}
    </Scroller>
  );
}

export function RowSkeleton() {
  return (
    <div className="mt-10 md:mt-14">
      <div className="mb-5 h-7 w-56 animate-pulse rounded bg-line" />
      <div className="flex gap-3 overflow-hidden md:gap-5">
        {Array.from({ length: 5 }, (_, i) => (
          <CardSkeleton key={i} className={ROW_ITEM} />
        ))}
      </div>
    </div>
  );
}
