/* Organizer overview: application status, today's sales, the coming week, events by status, unread decisions. */
import { BarChart3, Building2, CalendarPlus, CheckCircle2, ChevronRight, Clock, ScanLine, Store, XCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { sum } from '../../lib/format';
import { addDays, DAY, dateKey, fmtDate, fmtDT, hhmm, HOUR, now, relDay, todayKey } from '../../lib/time';
import { byId, safeLS, sumBy } from '../../lib/util';
import { eventSessions, evTitle, museumSlots, sessionSold, STATUS, unitInfo, unitStock } from '../../domain/rules';
import type { EventItem } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { useDb } from '../../store/db';
import { Badge, Button, Card, LinkButton, Notice, PageHeader, Stat } from '../../components/ui';
import { decisionName } from '../../features/ops/common';

type Upcoming = { key: string; ev: EventItem; startsAt: number; label: string; sold: number; total: number };
type News = { at: number; ok: boolean; title: string; text: string; reason: string; to: string };

const seenKey = (orgId: string) => `sayohat-org-seen-${orgId}`;

export default function OrgHome() {
  const { t3, tl, lang } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const org = byId(db.orgs, orgId);
  const [seen, setSeen] = useState<number>(() => Number(safeLS('get', seenKey(orgId))) || now() - 7 * DAY);

  const data = useMemo(() => {
    const evs = db.events.filter((e) => e.orgId === orgId);
    const evIds = new Set(evs.map((e) => e.id));
    const t = todayKey();
    const todayT = db.tickets.filter((x) => evIds.has(x.ev) && dateKey(x.at) === t);
    const on = todayT.filter((x) => x.ch !== 'box');
    const box = todayT.filter((x) => x.ch === 'box');
    const up: Upcoming[] = [];
    for (const ev of evs.filter((e) => e.status === 'published' || e.firstPublishedAt)) {
      if (ev.kind === 'museum') {
        for (let i = 0; i < 7; i++) {
          const dd = addDays(t, i);
          const sl = museumSlots(ev, dd, { any: true });
          if (!sl.length || (i === 0 && sl.every((s) => s.past))) continue;
          up.push({ key: ev.id + dd, ev, startsAt: sl[0].startMs, label: `${relDay(dd) || fmtDate(dd)} · ${sl[0].start}–${sl[sl.length - 1].end}`, sold: sumBy(sl, (s) => s.sold), total: sumBy(sl, (s) => s.limit) });
        }
      } else
        for (const s of eventSessions(ev.id)) {
          if (s.startsAt < now() - 2 * HOUR || s.startsAt > now() + 7 * DAY) continue;
          const u = unitInfo(s.id);
          const st = u ? unitStock(u) : { total: 0, free: 0 };
          const dk = dateKey(s.startsAt);
          up.push({ key: s.id, ev, startsAt: s.startsAt, label: `${relDay(dk) || fmtDate(s.startsAt)}, ${hhmm(s.startsAt)}${u?.hall && (u.venue?.halls.length || 0) > 1 ? ' · ' + u.hall.name : ''}`, sold: sessionSold(s.id), total: st.total });
        }
    }
    up.sort((a, b) => a.startsAt - b.startsAt);
    const byStatus = { draft: 0, moderation: 0, published: 0, rework: 0 } as Record<EventItem['status'], number>;
    for (const e of evs) byStatus[e.status]++;
    // decisions of moderators about this organizer
    const news: News[] = [];
    if (org)
      for (const h of org.history)
        if (h.decision === 'approved' || h.decision === 'rework')
          news.push({ at: h.at, ok: h.decision === 'approved', title: t3('Anketa', 'Анкета', 'Application'), text: decisionName(h.decision), reason: h.reason, to: '/org/application' });
    for (const e of evs) {
      for (const h of e.history)
        if (h.decision === 'approved' || h.decision === 'rework') news.push({ at: h.at, ok: h.decision === 'approved', title: evTitle(e), text: decisionName(h.decision), reason: h.reason, to: `/org/events/${e.id}` });
      for (const h of e.vcHistory || [])
        news.push({ at: h.at, ok: h.decision === 'approved', title: evTitle(e), text: (h.decision === 'approved' ? t3('Maydonni almashtirish tasdiqlandi', 'Смена площадки одобрена', 'Venue change approved') : t3('Maydonni almashtirish rad etildi', 'Смена площадки отклонена', 'Venue change declined')), reason: h.reason, to: `/org/events/${e.id}` });
    }
    for (const r of db.venueReqs.filter((x) => x.orgId === orgId))
      for (const h of r.history)
        if (h.status === 'done' || h.status === 'declined')
          news.push({ at: h.at, ok: h.status === 'done', title: r.name, text: h.status === 'done' ? t3('Maydon yaratildi', 'Площадка создана', 'Venue created') : t3('Maydon soʻrovi rad etildi', 'Запрос площадки отклонён', 'Venue request declined'), reason: h.reason, to: r.venueId ? `/org/venues/${r.venueId}` : '/org/venues' });
    news.sort((a, b) => b.at - a.at);
    return { evs, todayT, on, box, up, byStatus, news };
  }, [db, db.rev, orgId, org, t3, lang]);

  if (!org) return null;
  const unread = data.news.filter((n) => n.at > seen);
  const markRead = () => {
    const t = now();
    safeLS('set', seenKey(orgId), String(t));
    setSeen(t);
  };
  const lastRework = org.history.filter((h) => h.decision === 'rework').slice(-1)[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t3('Assalomu alaykum, {n}', 'Здравствуйте, {n}', 'Hello, {n}', { n: org.contact.split(' ')[0] || org.name })}
        sub={`${org.name} · ${fmtDT(now(), { weekday: true })} ${t3('(Toshkent vaqti)', '(по Ташкенту)', '(Tashkent time)')}`}
        actions={
          <LinkButton to="/org/events/new">
            <CalendarPlus className="size-5" />
            {t3('Tadbir yaratish', 'Создать мероприятие', 'New event')}
          </LinkButton>
        }
      />

      {org.status === 'review' && (
        <Notice tone="warn" className="mb-6" title={t3('Anketa tekshiruvda', 'Анкета на проверке', 'Your application is under review')}>
          <p>{t3('Moderator qarori emailga keladi. Hozir nima mumkin:', 'Решение модератора придёт на email. Что доступно сейчас:', 'The moderator’s decision will come by email. What you can do now:')}</p>
          <ul className="mt-2 space-y-1">
            <Can ok>{t3('Maydonlar, zallar va sxemalar yaratish', 'Создавать площадки, залы и схемы', 'Create venues, halls and seating plans')}</Can>
            <Can ok>{t3('Tadbir qoralamalarini tayyorlash', 'Готовить черновики мероприятий', 'Prepare event drafts')}</Can>
            <Can>{t3('Tadbirni moderatsiyaga yuborish — anketa tasdiqlangandan keyin', 'Отправлять мероприятия на модерацию — после одобрения анкеты', 'Send events for moderation: after the approval')}</Can>
            <Can>{t3('Kassa, kirish va hisobotlar — sotiladigan narsa boʻlganda', 'Касса, вход и отчёты — когда будет что продавать', 'Box office, entry and reports: once something is on sale')}</Can>
          </ul>
        </Notice>
      )}
      {org.status === 'rework' && (
        <Notice
          tone="bad"
          className="mb-6"
          title={t3('Anketani tuzatish kerak', 'Анкету нужно исправить', 'Your application needs changes')}
          action={
            <LinkButton to="/org/application" variant="danger" size="sm">
              {t3('Anketani tuzatish', 'Исправить анкету', 'Fix the application')}
            </LinkButton>
          }
        >
          {lastRework && (
            <>
              <p className="font-medium text-ink">{lastRework.reason}</p>
              <p className="mt-1 text-sm">
                {lastRework.by} · {fmtDT(lastRework.at)}
              </p>
            </>
          )}
        </Notice>
      )}
      {org.status === 'approved' && (
        <Notice tone="ok" className="mb-6" title={t3('Akkaunt tasdiqlangan', 'Аккаунт проверен', 'Your account is verified')}>
          {t3('Tadbirlarni moderatsiyaga yuborishingiz mumkin; tasdiqdan keyin sotuv sayt va kassada ochiladi.', 'Можно отправлять мероприятия на модерацию; после одобрения продажи откроются на сайте и в кассе.', 'You can send events for moderation; once approved they go on sale online and at the box office.')}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t3('Bugun sotildi', 'Продано сегодня', 'Sold today')} value={data.todayT.length} sub={t3('sayt {a} · kassa {b}', 'сайт {a} · касса {b}', 'online {a} · box office {b}', { a: data.on.length, b: data.box.length })} />
        <Stat label={t3('Bugungi tushum', 'Выручка сегодня', 'Revenue today')} value={<span className="text-xl">{sum(sumBy(data.todayT, (x) => x.p))}</span>} sub={t3('sayt {a} · kassa {b}', 'сайт {a} · касса {b}', 'online {a} · box {b}', { a: sum(sumBy(data.on, (x) => x.p)), b: sum(sumBy(data.box, (x) => x.p)) })} />
        <Stat label={t3('7 kunlik seanslar', 'Сеансы на 7 дней', 'Sessions, next 7 days')} value={data.up.length} sub={t3('sotilgan {a} / {b}', 'продано {a} / {b}', 'sold {a} / {b}', { a: sumBy(data.up, (u) => u.sold), b: sumBy(data.up, (u) => u.total) })} />
        <Stat label={t3('Moderator qarorlari', 'Решения модератора', 'Moderator decisions')} value={unread.length} sub={t3('oʻqilmagan', 'непрочитанные', 'unread')} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-bold">{t3('Yaqin 7 kun', 'Ближайшие 7 дней', 'Next 7 days')}</h2>
          {data.up.length ? (
            <ul className="divide-y divide-line">
              {data.up.slice(0, 12).map((u) => {
                const pct = u.total ? Math.round((u.sold / u.total) * 100) : 0;
                return (
                  <li key={u.key} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{evTitle(u.ev)}</div>
                      <div className="text-sm text-ink-3">{u.label}</div>
                    </div>
                    <div className="w-32 shrink-0 text-right">
                      <div className="text-sm tabular-nums">
                        <b>{u.sold}</b> / {u.total}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5">
                        <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-3">{t3('Yaqin hafta uchun seanslar yoʻq.', 'На ближайшую неделю сеансов нет.', 'Nothing scheduled for the next week.')}</p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t3('Moderator qarorlari', 'Решения модератора', 'Moderator decisions')}</h2>
              {unread.length > 0 && (
                <Button size="sm" variant="soft" onClick={markRead}>
                  {t3('Oʻqildi', 'Прочитано', 'Mark as read')}
                </Button>
              )}
            </div>
            {data.news.length ? (
              <ul className="space-y-2">
                {data.news.slice(0, 6).map((n, i) => (
                  <li key={i}>
                    <Link to={n.to} className="flex items-start gap-2.5 rounded-xl p-2 hover:bg-black/5">
                      {n.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-bad" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {n.title} {n.at > seen && <Badge tone="brand">{t3('yangi', 'новое', 'new')}</Badge>}
                        </span>
                        <span className="block text-sm text-ink-3">
                          {n.text} · {fmtDT(n.at)}
                        </span>
                        {n.reason && <span className="mt-1 block text-sm text-ink-2">{n.reason}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">{t3('Hali qarorlar yoʻq.', 'Решений пока нет.', 'No decisions yet.')}</p>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-bold">{t3('Tadbirlar holati', 'Мероприятия по статусам', 'Events by status')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {(['published', 'moderation', 'rework', 'draft'] as const).map((s) => (
                <Link key={s} to="/org/events" className="flex items-center justify-between rounded-xl bg-page px-3 py-2.5 hover:bg-black/5">
                  <span className="text-sm text-ink-2">{tl(STATUS[s])}</span>
                  <b className="tabular-nums">{data.byStatus[s]}</b>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Shortcut to="/org/events/new" icon={<CalendarPlus className="size-6" />} label={t3('Tadbir yaratish', 'Создать мероприятие', 'New event')} />
        <Shortcut to="/org/box" icon={<Store className="size-6" />} label={t3('Kassa', 'Касса', 'Box office')} />
        <Shortcut to="/org/entry" icon={<ScanLine className="size-6" />} label={t3('Kirish nazorati', 'Проверка на входе', 'Entry check')} />
        <Shortcut to="/org/venues" icon={<Building2 className="size-6" />} label={t3('Maydonlar', 'Площадки', 'Venues')} />
        <Shortcut to="/org/reports" icon={<BarChart3 className="size-6" />} label={t3('Hisobotlar', 'Отчёты', 'Reports')} />
        <Shortcut to="/org/application" icon={<Clock className="size-6" />} label={t3('Anketa', 'Анкета', 'Application')} />
      </div>
    </div>
  );
}

function Can({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-bad" />}
      <span>{children}</span>
    </li>
  );
}

function Shortcut({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold shadow-[var(--shadow-card)] transition-colors hover:bg-brand-soft">
      <span className="grid size-11 place-items-center rounded-xl bg-brand">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 text-ink-3" />
    </Link>
  );
}
