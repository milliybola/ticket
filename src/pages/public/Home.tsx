/* Home page: iticket.uz promotion blocks (live), the top banner, Sayohat organizers' events and the organizers' call. */
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { useItBanners, useItPromotions } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { storefrontEvents } from '../../domain/rules';
import { useDb } from '../../store/db';
import { Button, Notice } from '../../components/ui';
import { CardRow, RowSkeleton } from '../../components/storefront/EventCard';
import { HeroSlider } from '../../components/storefront/HeroSlider';
import { fromIt, fromLocal } from '../../components/storefront/model';

function TopBanner() {
  const { t3 } = useI18n();
  const { data } = useItBanners();
  const top = data?.top;
  if (!top?.image) return null;
  const img = (
    <picture>
      {top.mobile_image && <source media="(max-width: 767px)" srcSet={top.mobile_image} />}
      <img src={top.image} alt={t3('Reklama', 'Реклама', 'Advertisement')} className="w-full rounded-2xl object-cover" loading="lazy" />
    </picture>
  );
  return (
    <div className="mt-4">
      {top.link ? (
        <a href={top.link} target="_blank" rel="noopener noreferrer sponsored" className="block">
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  );
}

function LocalBlock() {
  const { t3 } = useI18n();
  useDb(); // re-render on any change of the local data (other tabs included)
  const items = storefrontEvents()
    .map(fromLocal)
    .sort((a, b) => a.start - b.start);
  return (
    <CardRow
      title={t3('Sayohat tashkilotchilaridan', 'От организаторов Sayohat', 'From Sayohat organizers')}
      items={items}
      action={
        <Link to="/events" className="hidden text-[15px] font-semibold text-ink-2 hover:text-ink sm:inline">
          {t3('Hammasi', 'Все', 'All')}
        </Link>
      }
    />
  );
}

function OrganizersBlock() {
  const { t3 } = useI18n();
  return (
    <section className="mt-12 overflow-hidden rounded-[var(--radius-card)] bg-brand md:mt-16">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-10">
        <div className="max-w-2xl">
          <div className="text-sm font-bold tracking-wide uppercase">{t3('Tashkilotchilarga', 'Организаторам', 'For organizers')}</div>
          <h2 className="mt-2 text-2xl leading-tight font-extrabold md:text-4xl">
            {t3('Tadbiringizni Sayohat orqali soting', 'Продавайте билеты на своё событие через Sayohat', 'Sell tickets for your event with Sayohat')}
          </h2>
          <p className="mt-3 text-[15px] text-ink-2 md:text-base">
            {t3(
              'Konsertlar, spektakllar, kino, muzeylar va sport: zal sxemasi, narxlar, kassa, kirishda QR-tekshiruv va hisobotlar — bitta kabinetda.',
              'Концерты, спектакли, кино, музеи и спорт: схема зала, цены, касса, проверка QR на входе и отчёты — в одном кабинете.',
              'Concerts, plays, cinema, museums and sport: seating plan, prices, box office, QR check at the entrance and reports in one account.',
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link to="/organizers" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-ink px-6 font-semibold text-white transition hover:bg-ink-2">
            {t3('Batafsil', 'Подробнее', 'Learn more')} <ArrowRight className="size-4" />
          </Link>
          <Link to="/org/register" className="inline-flex h-12 items-center rounded-2xl bg-white px-6 font-semibold text-ink transition hover:bg-white/80">
            {t3('Roʻyxatdan oʻtish', 'Зарегистрироваться', 'Sign up')}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t3 } = useI18n();
  const promo = useItPromotions();
  const blocks = promo.data || [];
  const slider = blocks.find((b) => b.skin === 1);
  const rows = blocks.filter((b) => b.skin !== 1);

  return (
    <div className="mx-auto max-w-[1280px] px-4 lg:px-5">
      <TopBanner />
      {promo.isLoading ? (
        <>
          <div className="mt-6 aspect-[1400/794] animate-pulse rounded-[var(--radius-card)] bg-line md:aspect-[1400/600]" />
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : promo.isError ? (
        <Notice
          tone="warn"
          className="mt-6"
          title={t3('iticket.uz afishasi yuklanmadi', 'Не удалось загрузить афишу iticket.uz', 'Could not load the iticket.uz listings')}
          action={
            <Button size="sm" variant="dark" onClick={() => promo.refetch()}>
              <RefreshCw className="size-4" /> {t3('Qayta urinish', 'Повторить', 'Retry')}
            </Button>
          }
        >
          {t3('Internet aloqasini tekshiring. Sayohat tadbirlari quyida.', 'Проверьте подключение. События Sayohat — ниже.', 'Check your connection. Sayohat events are below.')}
        </Notice>
      ) : (
        slider && <HeroSlider events={slider.items.filter((x) => x.type === 'event').map((x) => x.data)} />
      )}

      {rows.slice(0, 1).map((b) => (
        <CardRow key={b.id} title={b.name} large={b.skin === 2} items={b.items.filter((x) => x.type === 'event').map((x) => fromIt(x.data))} />
      ))}
      <LocalBlock />
      {rows.slice(1).map((b) => (
        <CardRow key={b.id} title={b.name} large={b.skin === 2} items={b.items.filter((x) => x.type === 'event').map((x) => fromIt(x.data))} />
      ))}
      <OrganizersBlock />
    </div>
  );
}
