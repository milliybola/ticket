/* Moderation queue (US-22, US-23): events waiting for a decision (earliest first session first, then oldest
   submission) and pending venue changes of published events. */
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { ago, fmtDT } from '../../lib/time';
import { byId } from '../../lib/util';
import { cityName, evTitle, getVenue, kindName } from '../../domain/rules';
import { useDb } from '../../store/db';
import { Badge, Card, Empty, PageHeader } from '../../components/ui';
import { firstSession } from '../../features/ops/moderation';

export default function ModEvents() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const nav = useNavigate();
  const queue = useMemo(
    () =>
      db.events
        .filter((e) => e.status === 'moderation')
        .map((e) => ({ e, first: firstSession(e) }))
        .sort((a, b) => (a.first ?? Infinity) - (b.first ?? Infinity) || (a.e.submittedAt || 0) - (b.e.submittedAt || 0)),
    [db, db.rev, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const changes = db.events.filter((e) => e.venueChange?.status === 'pending').sort((a, b) => a.venueChange!.submittedAt - b.venueChange!.submittedAt);
  const head = [t3('Tadbir', 'Мероприятие', 'Event'), t3('Tashkilotchi', 'Организатор', 'Organizer'), t3('Maydon', 'Площадка', 'Venue'), t3('Birinchi seans', 'Первый сеанс', 'First session'), t3('Yuborilgan', 'Отправлено', 'Submitted'), t3('Belgi', 'Пометка', 'Mark')];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t3('Moderatsiyadagi tadbirlar', 'Мероприятия на модерации', 'Events in moderation')} sub={t3('Avval birinchi seansi eng yaqin boʻlganlar, keyin eng eski arizalar.', 'Сначала заявки с самым ранним первым сеансом, затем самые старые.', 'Earliest first session first, then the oldest submissions.')} />
      {queue.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[900px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                {head.map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queue.map(({ e, first }) => {
                const v = getVenue(e.venueId);
                return (
                  <tr key={e.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-page" onClick={() => nav(`/mod/events/${e.id}`)}>
                    <td className="px-4 py-3">
                      <b className="block">{evTitle(e)}</b>
                      <span className="text-sm text-ink-3">{kindName(e.kind)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">{byId(db.orgs, e.orgId)?.name}</td>
                    <td className="px-4 py-3 text-sm">
                      {v ? v.name : '—'}
                      {v && <span className="block text-ink-3">{cityName(v.city)}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">{first ? fmtDT(first) : '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {e.submittedAt ? fmtDT(e.submittedAt) : '—'}
                      {e.submittedAt && <span className="block text-ink-3">{ago(e.submittedAt)}</span>}
                    </td>
                    <td className="space-x-1 px-4 py-3">
                      {e.resubmitted && <Badge tone="info">{t3('Qayta', 'Повторно', 'Again')}</Badge>}
                      {e.venueChange?.status === 'pending' && <Badge tone="warn">{t3('Maydon almashtirish', 'Смена площадки', 'Venue change')}</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <Empty icon={<ShieldCheck className="size-10" />} title={t3('Navbat boʻsh', 'Очередь пуста', 'The queue is empty')}>
            {t3('Yangi arizalar shu yerda paydo boʻladi.', 'Новые заявки появятся здесь.', 'New submissions will appear here.')}
          </Empty>
        </Card>
      )}

      <h2 className="mt-10 mb-4 text-xl font-bold">{t3('Maydonni almashtirish soʻrovlari', 'Смены площадки на проверке', 'Venue changes to review')}</h2>
      {changes.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[760px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                {[t3('Tadbir', 'Мероприятие', 'Event'), t3('Tashkilotchi', 'Организатор', 'Organizer'), t3('Oldin → Keyin', 'Было → Стало', 'Before → After'), t3('Yuborilgan', 'Отправлено', 'Submitted')].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changes.map((e) => {
                const a = getVenue(e.venueChange!.from);
                const b = getVenue(e.venueChange!.to);
                return (
                  <tr key={e.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-page" onClick={() => nav(`/mod/events/${e.id}?tab=venue`)}>
                    <td className="px-4 py-3">
                      <b className="block">{evTitle(e)}</b>
                      <span className="text-sm text-ink-3">{kindName(e.kind)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">{byId(db.orgs, e.orgId)?.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {a ? `${a.name} (${cityName(a.city)})` : '—'} <ArrowRight className="size-4" /> <b>{b ? `${b.name} (${cityName(b.city)})` : '—'}</b>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {fmtDT(e.venueChange!.submittedAt)}
                      <span className="block text-ink-3">{ago(e.venueChange!.submittedAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <p className="text-ink-3">{t3('Kutilayotgan maydon almashtirishlari yoʻq.', 'Ожидающих смен площадки нет.', 'No pending venue changes.')}</p>
        </Card>
      )}
    </div>
  );
}
