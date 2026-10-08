/* Organizer's events: status tabs, sessions, sales and the next date; create and delete drafts (US-12). */
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { tl, useI18n } from '../../lib/i18n';
import { fmtDT } from '../../lib/time';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { cityName, eventSessions, evTitle, kindName, nextStart, orgEvents, STATUS } from '../../domain/rules';
import type { EventItem, EventStatus } from '../../domain/types';
import { Poster } from '../../components/common';
import { Badge, Empty, IconButton, LinkButton, PageHeader, Tabs, toast } from '../../components/ui';
import { canDeleteEvent, deleteEvent, STATUS_TONE } from '../../features/events/helpers';
import { ConfirmHost, confirmBox } from '../../features/events/ui';

type Filter = 'all' | EventStatus;

export default function OrgEvents() {
  const { t3 } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const nav = useNavigate();
  const [f, setF] = useState<Filter>('all');
  const all = orgEvents(orgId).sort((a, b) => b.createdAt - a.createdAt);
  const cnt = (st: EventStatus) => all.filter((e) => e.status === st).length;
  const list = all.filter((e) => f === 'all' || e.status === f);
  const soldBy: Record<string, number> = {};
  for (const t of db.tickets) soldBy[t.ev] = (soldBy[t.ev] || 0) + 1;

  const open = (ev: EventItem) => nav(`/org/events/${ev.id}/${ev.status === 'moderation' || ev.status === 'published' ? 'submit' : 'card'}`);
  const remove = async (ev: EventItem) => {
    const ok = await confirmBox({
      title: t3('Tadbir oʻchirilsinmi?', 'Удалить мероприятие?', 'Delete this event?'),
      text: t3('«{t}» va uning seanslari oʻchiriladi.', '«{t}» и его сеансы будут удалены.', '"{t}" and its sessions will be deleted.', { t: evTitle(ev) }),
      danger: true,
      ok: t3('Oʻchirish', 'Удалить', 'Delete'),
    });
    if (!ok) return;
    deleteEvent(ev.id);
    toast(t3('Tadbir oʻchirildi', 'Мероприятие удалено', 'Event deleted'), 'ok');
  };
  const sessionsCell = (ev: EventItem) => {
    if (ev.kind === 'museum') return <span className="text-ink-2">{t3('grafik', 'график', 'schedule')}</span>;
    const ss = eventSessions(ev.id);
    return <span className="tabular-nums">{ss.length}</span>;
  };
  const nextCell = (ev: EventItem) => {
    const n = nextStart(ev);
    if (n) return fmtDT(n);
    return <span className="text-ink-3">{ev.kind === 'museum' ? t3('ochiq slotlar yoʻq', 'нет открытых слотов', 'no open slots') : t3('kelgusi seanslar yoʻq', 'нет будущих сеансов', 'no upcoming sessions')}</span>;
  };

  return (
    <div>
      <PageHeader
        title={t3('Tadbirlar', 'Мероприятия', 'Events')}
        sub={t3('Yangi tadbir moderator tekshiruvidan keyin eʼlon qilinadi. Seanslar, narxlar va tavsif keyin darhol oʻzgaradi.', 'Новое мероприятие публикуется после проверки модератора. Сеансы, цены и описание потом меняются сразу.', 'A new event goes live after a moderator’s review. Sessions, prices and the description then change at once.')}
        actions={
          <LinkButton to="/org/events/new">
            <Plus className="size-4" />
            {t3('Tadbir yaratish', 'Создать мероприятие', 'New event')}
          </LinkButton>
        }
      />
      <Tabs
        className="mb-5"
        value={f}
        onChange={setF}
        tabs={[
          { value: 'all', label: t3('Hammasi', 'Все', 'All'), count: all.length },
          { value: 'draft', label: tl(STATUS.draft), count: cnt('draft') },
          { value: 'moderation', label: tl(STATUS.moderation), count: cnt('moderation') },
          { value: 'rework', label: tl(STATUS.rework), count: cnt('rework') },
          { value: 'published', label: tl(STATUS.published), count: cnt('published') },
        ]}
      />
      {list.length ? (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)] md:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-line text-sm text-ink-3">
                  <th className="px-4 py-3 font-medium">{t3('Tadbir', 'Мероприятие', 'Event')}</th>
                  <th className="px-4 py-3 font-medium">{t3('Maydon', 'Площадка', 'Venue')}</th>
                  <th className="px-4 py-3 font-medium">{t3('Holat', 'Статус', 'Status')}</th>
                  <th className="px-4 py-3 font-medium">{t3('Seanslar', 'Сеансы', 'Sessions')}</th>
                  <th className="px-4 py-3 font-medium">{t3('Sotilgan', 'Продано', 'Sold')}</th>
                  <th className="px-4 py-3 font-medium">{t3('Eng yaqin', 'Ближайший', 'Next')}</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.map((ev) => {
                  const v = db.venues.find((x) => x.id === ev.venueId);
                  return (
                    <tr key={ev.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-page" onClick={() => open(ev)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg">
                            <Poster card={ev.card} showTitle={false} />
                          </div>
                          <div className="min-w-0">
                            <b className="block truncate">{evTitle(ev)}</b>
                            <span className="text-sm text-ink-3">{kindName(ev.kind)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {v ? v.name : '—'}
                        {v && <div className="text-sm text-ink-3">{cityName(v.city)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[ev.status]}>{tl(STATUS[ev.status])}</Badge>
                        {ev.venueChange?.status === 'pending' && (
                          <div className="mt-1">
                            <Badge tone="info">{t3('Maydon almashuvi', 'Смена площадки', 'Venue change')}</Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{sessionsCell(ev)}</td>
                      <td className="px-4 py-3 tabular-nums">{soldBy[ev.id] || 0}</td>
                      <td className="px-4 py-3 text-sm">{nextCell(ev)}</td>
                      <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {canDeleteEvent(ev) && (
                          <IconButton label={t3('Oʻchirish', 'Удалить', 'Delete')} className="text-bad" onClick={() => remove(ev)}>
                            <Trash2 className="size-4" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* phone cards */}
          <ul className="space-y-3 md:hidden">
            {list.map((ev) => {
              const v = db.venues.find((x) => x.id === ev.venueId);
              return (
                <li key={ev.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-[var(--shadow-card)]" onClick={() => open(ev)}>
                  <div className="h-24 w-18 shrink-0 overflow-hidden rounded-lg">
                    <Poster card={ev.card} showTitle={false} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <b className="min-w-0 flex-1 truncate">{evTitle(ev)}</b>
                      {canDeleteEvent(ev) && (
                        <IconButton
                          label={t3('Oʻchirish', 'Удалить', 'Delete')}
                          className="-mt-2 -mr-2 text-bad"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(ev);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </div>
                    <div className="text-sm text-ink-3">
                      {kindName(ev.kind)}
                      {v && ` · ${v.name}`}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={STATUS_TONE[ev.status]}>{tl(STATUS[ev.status])}</Badge>
                      <span className="text-ink-3">
                        {t3('Seanslar', 'Сеансы', 'Sessions')}: {sessionsCell(ev)}
                      </span>
                      <span className="text-ink-3">
                        {t3('Sotilgan', 'Продано', 'Sold')}: {soldBy[ev.id] || 0}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">{nextCell(ev)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Empty
          icon={<CalendarDays className="size-10" />}
          title={f === 'all' ? t3('Hozircha tadbirlar yoʻq', 'Мероприятий пока нет', 'No events yet') : t3('Bu yerda boʻsh', 'Здесь пусто', 'Nothing here')}
          action={
            f === 'all' ? (
              <LinkButton to="/org/events/new">
                <Plus className="size-4" />
                {t3('Tadbir yaratish', 'Создать мероприятие', 'New event')}
              </LinkButton>
            ) : undefined
          }
        >
          {f === 'all' ? t3('Birinchisini yarating: turini, maydonni tanlang va kartochkani toʻldiring.', 'Создайте первое: выберите вид, площадку и заполните карточку.', 'Create the first one: choose the kind, the venue and fill in the card.') : undefined}
        </Empty>
      )}
      <ConfirmHost />
    </div>
  );
}
