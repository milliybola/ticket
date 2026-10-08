/* Full-width hero slider of the home page (iticket.uz promotion block with skin 1). */
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { ItEventShort } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { itEventPath } from './model';

export function HeroSlider({ events }: { events: ItEventShort[] }) {
  const { t3 } = useI18n();
  const slides = events.filter((e) => e.slide_url || e.poster_wide_url);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((k: number) => setI((v) => (n ? (v + k + n) % n : 0)), [n]);

  useEffect(() => {
    if (paused || n < 2) return;
    const id = window.setInterval(() => go(1), 5500);
    return () => window.clearInterval(id);
  }, [paused, n, go]);
  useEffect(() => {
    if (i >= n) setI(0);
  }, [i, n]);

  if (!n) return null;
  return (
    <section
      className="relative mt-4 overflow-hidden rounded-[var(--radius-card)] bg-line md:mt-6"
      aria-roledescription="carousel"
      aria-label={t3('Afisha', 'Афиша', 'Featured')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((ev, k) => {
          const img = ev.slide_url || ev.poster_wide_url;
          const inner = <img src={img} alt={ev.name} className="aspect-[1400/794] w-full object-cover md:aspect-[1400/600]" loading={k === 0 ? 'eager' : 'lazy'} draggable={false} />;
          const cls = 'block w-full shrink-0';
          const hidden = k !== i;
          return ev.external_url ? (
            <a key={ev.id} href={ev.external_url} target="_blank" rel="noopener noreferrer" className={cls} aria-hidden={hidden} tabIndex={hidden ? -1 : 0}>
              {inner}
            </a>
          ) : (
            <Link key={ev.id} to={itEventPath(ev)} className={cls} aria-hidden={hidden} tabIndex={hidden ? -1 : 0}>
              {inner}
            </Link>
          );
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label={t3('Oldingi', 'Предыдущий', 'Previous')} className="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-lg transition hover:bg-brand md:grid">
            <ChevronLeft className="size-6" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label={t3('Keyingi', 'Следующий', 'Next')} className="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-lg transition hover:bg-brand md:grid">
            <ChevronRight className="size-6" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {slides.map((ev, k) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setI(k)}
                aria-label={`${k + 1} / ${n}`}
                aria-current={k === i}
                className={clsx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-brand' : 'w-2 bg-white/70 hover:bg-white')}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
