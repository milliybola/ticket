/* Organizer's venues (US-04) and their requests to moderators (US-11). */
import { Building2, ChevronRight, Plus, UserRoundCog } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { t3, tl, useI18n } from '../../lib/i18n';
import { fmtStamp } from '../../lib/time';
import { sumBy } from '../../lib/util';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { cityName, getScheme, venueEvents } from '../../domain/rules';
import { capacityOf } from '../../domain/scheme';
import type { VenueRequest } from '../../domain/types';
import { Badge, Button, Card, Empty, PageHeader } from '../../components/ui';
import { VENUE_TYPE, VenueRequestModal } from '../../features/venues/VenueForms';

const REQ_STATUS: Record<VenueRequest['status'], { l: () => string; tone: 'warn' | 'ok' | 'bad' | 'info' }> = {
  new: { l: () => t3('Yangi', 'Новый', 'New'), tone: 'warn' },
  progress: { l: () => t3('Ishda', 'В работе', 'In progress'), tone: 'info' },
  done: { l: () => t3('Tayyor', 'Готово', 'Done'), tone: 'ok' },
  declined: { l: () => t3('Rad etildi', 'Отклонён', 'Declined'), tone: 'bad' },
};

export default function OrgVenues() {
  useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const org = db.orgs.find((o) => o.id === orgId)!;
  const nav = useNavigate();
  const [req, setReq] = useState(false);
  const venues = db.venues.filter((v) => v.orgId === orgId).sort((a, b) => b.createdAt - a.createdAt);
  const reqs = db.venueReqs.filter((r) => r.orgId === orgId).sort((a, b) => b.createdAt - a.createdAt);
  const approved = org.status === 'approved';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t3('Maydonlar va zallar', 'Площадки и залы', 'Venues and halls')}
        sub={t3('Maydon — tadbirlar asosi: manzil va turi. Sxema turidagi maydonda joyli zallar boʻladi.', 'Площадка — основа мероприятий: адрес и вид. У площадки со схемой — залы с местами.', 'A venue is where your events happen: an address and a kind. Seating-plan venues have halls with seats.')}
        actions={
          <>
            <Button variant="outline" disabled={!approved} title={approved ? '' : t3('Anketa tasdiqlangandan keyin', 'Доступно после одобрения анкеты', 'Available after your application is approved')} onClick={() => setReq(true)}>
              <UserRoundCog className="size-4" />
              {t3('Moderatordan soʻrash', 'Попросить модератора', 'Ask a moderator')}
            </Button>
            <Button onClick={() => nav('/org/venues/new')}>
              <Plus className="size-4" />
              {t3('Maydon qoʻshish', 'Добавить площадку', 'Add venue')}
            </Button>
          </>
        }
      />
      {venues.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {venues.map((v) => {
            const evs = venueEvents(v.id);
            const cap = v.type === 'scheme' ? sumBy(v.halls, (h) => {
              const sc = getScheme(h.schemeId);
              return sc ? capacityOf(sc) : 0;
            }) : 0;
            return (
              <Link key={v.id} to={`/org/venues/${v.id}`} className="group rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand">
                    <Building2 className="size-5" />
                  </div>
                  <ChevronRight className="size-5 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-3 text-lg leading-tight font-bold">{v.name}</div>
                <div className="mt-1 text-sm text-ink-3">
                  {cityName(v.city)}, {v.address}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{tl(VENUE_TYPE[v.type])}</Badge>
                  {v.type === 'scheme' && <Badge tone="info">{t3('{n} zal', '{n} зал(а)', '{n} hall(s)', { n: v.halls.length })}</Badge>}
                  {cap > 0 && <Badge tone="info">{t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: cap })}</Badge>}
                  <Badge tone={evs.length ? 'ok' : 'neutral'}>{t3('{n} tadbir', '{n} мероприят.', '{n} events', { n: evs.length })}</Badge>
                  {v.createdBy === 'mod' && <Badge tone="warn">{t3('Moderator yaratgan', 'Создал модератор', 'Created by a moderator')}</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<Building2 className="size-10" />}
            title={t3('Hozircha maydonlar yoʻq', 'Площадок пока нет', 'No venues yet')}
            action={
              <Button onClick={() => nav('/org/venues/new')}>
                <Plus className="size-4" />
                {t3('Maydon qoʻshish', 'Добавить площадку', 'Add venue')}
              </Button>
            }
          >
            {t3('Tadbirlar yaratish uchun maydon qoʻshing: teatr, kinoteatr, konsert zali, stadion yoki muzey.', 'Добавьте площадку, чтобы создавать на ней мероприятия: театр, кинотеатр, концертный зал, стадион или музей.', 'Add a venue to start creating events: a theatre, cinema, concert hall, stadium or museum.')}
          </Empty>
        </Card>
      )}
      {reqs.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-lg font-bold">{t3('Moderatorga soʻrovlar', 'Запросы модератору', 'Requests to moderators')}</h2>
          <ul className="divide-y divide-line">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-sm text-ink-3">
                    {cityName(r.city)}, {r.address} · {tl(VENUE_TYPE[r.type])} · {fmtStamp(r.createdAt)}
                  </div>
                  {r.status === 'declined' && r.reason && (
                    <div className="mt-1 text-sm text-bad">
                      {t3('Sabab', 'Причина', 'Reason')}: {r.reason}
                    </div>
                  )}
                </div>
                <Badge tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].l()}</Badge>
                {r.status === 'done' && r.venueId && (
                  <Link to={`/org/venues/${r.venueId}`} className="text-sm font-semibold underline">
                    {t3('Ochish', 'Открыть', 'Open')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <VenueRequestModal open={req} onClose={() => setReq(false)} orgId={orgId} />
    </div>
  );
}
