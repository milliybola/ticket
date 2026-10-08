/* /venues — iticket.uz venues (paginated, "show more") and venues of Sayohat organizers. */
import { useState } from 'react';
import { useItVenues } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { useDb } from '../../store/db';
import { Button, Notice } from '../../components/ui';
import { ItVenueCard, LocalVenueCard } from '../../components/storefront/VenueCards';

function Chunk({ page, last, onMore }: { page: number; last: boolean; onMore: () => void }) {
  const { t3 } = useI18n();
  const q = useItVenues(page);
  // keepPreviousData would show the previous page here while this one loads
  if (q.isLoading || q.isPlaceholderData)
    return (
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-[var(--radius-card)] bg-line md:h-[120px]" />
        ))}
      </>
    );
  if (q.isError)
    return (
      <Notice tone="warn" className="col-span-full" action={<Button size="sm" variant="dark" onClick={() => q.refetch()}>{t3('Qayta urinish', 'Повторить', 'Retry')}</Button>}>
        {t3('Joylar yuklanmadi.', 'Не удалось загрузить площадки.', 'Could not load venues.')}
      </Notice>
    );
  return (
    <>
      {q.data?.data.map((v) => <ItVenueCard key={v.id} v={v} />)}
      {last && q.data?.next_page_url && (
        <div className="col-span-full mt-2 flex justify-center">
          <Button variant="outline" onClick={onMore}>
            {t3('Koʻproq koʻrsatish', 'Показать ещё', 'Show more')}
          </Button>
        </div>
      )}
    </>
  );
}

export default function Venues() {
  const { t3 } = useI18n();
  const db = useDb();
  const [pages, setPages] = useState(1);
  const local = db.venues;
  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-5 md:pt-10">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight md:text-[40px]">{t3('Joylar', 'Площадки', 'Venues')}</h1>

      {local.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-4 text-xl font-bold md:text-2xl">{t3('Sayohat tashkilotchilari joylari', 'Площадки организаторов Sayohat', 'Venues of Sayohat organizers')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {local.map((v) => (
              <LocalVenueCard key={v.id} v={v} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold md:text-2xl">{t3('iticket.uz joylari', 'Площадки iticket.uz', 'iticket.uz venues')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
          {Array.from({ length: pages }, (_, i) => (
            <Chunk key={i + 1} page={i + 1} last={i + 1 === pages} onMore={() => setPages((p) => p + 1)} />
          ))}
        </div>
      </section>
    </div>
  );
}
