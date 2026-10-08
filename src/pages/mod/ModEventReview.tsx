/* Moderator's review of one event (US-22) and of a venue change (US-23): buyer-view preview in three languages,
   checklist, decision history, approve / return with a reason; "Before / After" comparison for a venue change. */
import { ArrowLeft, CheckCircle2, CircleAlert, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { LANG_LABEL, LANGS, useI18n, type Lang } from '../../lib/i18n';
import { fmtDT } from '../../lib/time';
import { byId } from '../../lib/util';
import { decideEvent, decideVenueChange, eventChecklist, evTitle, getScheme, getVenue, kindName, STATUS } from '../../domain/rules';
import type { EventItem, Venue } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { useDb } from '../../store/db';
import { Badge, Button, Card, Empty, Notice, PageHeader, Segmented, Tabs, toast } from '../../components/ui';
import { alreadyText, ConfirmDialog, DecisionHistory, ReasonDialog } from '../../features/ops/common';
import { useEnsureEventPlan } from '../../sync/iticket';
import { EventPreview, PlanPreview, venueLine } from '../../features/ops/EventPreview';

export default function ModEventReview() {
  const { t3, tl, lang } = useI18n();
  const db = useDb();
  const { eventId } = useParams();
  const [sp, setSp] = useSearchParams();
  const ev = byId(db.events, eventId);
  const [plang, setPlang] = useState<Lang>(lang);
  useEnsureEventPlan(ev);
  if (!ev)
    return (
      <Empty title={t3('Tadbir topilmadi', 'Мероприятие не найдено', 'Event not found')}>
        <Link to="/mod/events" className="underline">
          {t3('Navbatga qaytish', 'К очереди', 'Back to the queue')}
        </Link>
      </Empty>
    );
  const org = byId(db.orgs, ev.orgId);
  const vcPending = ev.venueChange?.status === 'pending';
  const tab = sp.get('tab') === 'venue' && vcPending ? 'venue' : ev.status === 'moderation' || !vcPending ? 'event' : 'venue';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={
          <Link to="/mod/events" className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" />
            {t3('Moderatsiya navbati', 'Очередь модерации', 'Moderation queue')}
          </Link>
        }
        title={evTitle(ev)}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {kindName(ev.kind)} · {org?.name}
            <Badge tone={ev.status === 'published' ? 'ok' : ev.status === 'moderation' ? 'warn' : ev.status === 'rework' ? 'bad' : 'neutral'}>{tl(STATUS[ev.status])}</Badge>
            {ev.resubmitted && ev.status === 'moderation' && <Badge tone="info">{t3('Qayta', 'Повторно', 'Again')}</Badge>}
            {vcPending && <Badge tone="warn">{t3('Maydon almashtirish', 'Смена площадки', 'Venue change')}</Badge>}
          </span>
        }
      />
      {vcPending && (
        <Tabs
          className="mb-6"
          value={tab}
          onChange={(v) => setSp(v === 'venue' ? { tab: 'venue' } : {}, { replace: true })}
          tabs={[
            { value: 'event', label: t3('Tadbir', 'Мероприятие', 'Event') },
            { value: 'venue', label: t3('Maydonni almashtirish', 'Смена площадки', 'Venue change') },
          ]}
        />
      )}
      {tab === 'venue' ? (
        <VenueChangeReview ev={ev} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{t3('Xaridor koʻradigan sahifa', 'Как увидит покупатель', 'As the buyer will see it')}</h2>
              <Segmented size="sm" value={plang} onChange={setPlang} options={LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))} />
            </div>
            <EventPreview ev={ev} lang={plang} />
          </Card>
          <EventSide ev={ev} />
        </div>
      )}
    </div>
  );
}

function EventSide({ ev }: { ev: EventItem }) {
  const { t3 } = useI18n();
  const db = useDb();
  const modId = useAuth((s) => s.modId);
  const mod = byId(db.mods, modId);
  const [confirm, setConfirm] = useState(false);
  const [ret, setRet] = useState(false);
  const [already, setAlready] = useState('');
  const checklist = eventChecklist(ev);
  const decide = (d: 'approved' | 'rework', reason: string) => {
    const r = decideEvent(ev.id, d, reason, mod?.name || '');
    if (!r.ok) return setAlready(alreadyText(r.already));
    toast(d === 'approved' ? t3('Tadbir eʼlon qilindi, sotuv ochildi', 'Мероприятие опубликовано, продажи открыты', 'Event published, sales are open') : t3('Tadbir tuzatishga qaytarildi', 'Мероприятие возвращено на доработку', 'Event returned for changes'), 'ok');
  };
  return (
    <div className="space-y-6">
      {already && <Notice tone="bad">{already}</Notice>}
      {ev.status === 'moderation' ? (
        <Card className="!p-4">
          <div className="text-sm text-ink-3">
            {t3('Yuborilgan', 'Отправлено', 'Submitted')}: {ev.submittedAt ? fmtDT(ev.submittedAt) : '—'}
          </div>
          <div className="mt-3 grid gap-2">
            <Button variant="ok" onClick={() => setConfirm(true)}>
              <CheckCircle2 className="size-5" />
              {t3('Tasdiqlash', 'Одобрить', 'Approve')}
            </Button>
            <Button variant="outline" onClick={() => setRet(true)}>
              <RotateCcw className="size-4" />
              {t3('Tuzatishga qaytarish', 'Вернуть на доработку', 'Return for changes')}
            </Button>
          </div>
        </Card>
      ) : (
        <Notice tone="neutral">{t3('Bu tadbir moderatsiyada emas — qaror talab qilinmaydi.', 'Мероприятие не на модерации — решение не требуется.', 'This event is not in moderation: no decision needed.')}</Notice>
      )}
      <Card className="!p-4">
        <h3 className="mb-3 font-bold">{t3('Tekshiruv roʻyxati', 'Чек-лист', 'Checklist')}</h3>
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-bad" />}
              <span>
                <span className="font-medium">{c.label}</span>
                {c.hint && <span className="block text-sm text-bad">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="!p-4">
        <h3 className="mb-3 font-bold">{t3('Qarorlar tarixi', 'История решений', 'Decision history')}</h3>
        <DecisionHistory items={ev.history} />
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t3('Tadbirni eʼlon qilasizmi?', 'Опубликовать мероприятие?', 'Publish the event?')} text={t3('Barcha kelgusi seanslarga sotuv sayt va kassada darhol ochiladi.', 'Продажи на все будущие сеансы сразу откроются на сайте и в кассе.', 'Sales open at once online and at the box office for all upcoming sessions.')} okLabel={t3('Tasdiqlash', 'Одобрить', 'Approve')} onOk={() => decide('approved', '')} />
      <ReasonDialog open={ret} onClose={() => setRet(false)} title={t3('Tuzatishga qaytarish', 'Вернуть на доработку', 'Return for changes')} hint={t3('Sabab tashkilotchiga email bilan yuboriladi va kabinetida koʻrinadi.', 'Причина уйдёт организатору письмом и будет видна в кабинете.', 'The reason is emailed to the organizer and shown in the cabinet.')} okLabel={t3('Qaytarish', 'Вернуть', 'Return')} onOk={(r) => decide('rework', r)} />
    </div>
  );
}

function VenueChangeReview({ ev }: { ev: EventItem }) {
  const { t3, lang } = useI18n();
  const db = useDb();
  const modId = useAuth((s) => s.modId);
  const mod = byId(db.mods, modId);
  const [confirm, setConfirm] = useState(false);
  const [ret, setRet] = useState(false);
  const [already, setAlready] = useState('');
  const vc = ev.venueChange;
  const decide = (d: 'approved' | 'rework', reason: string) => {
    const r = decideVenueChange(ev.id, d, reason, mod?.name || '');
    if (!r.ok) {
      const last = r.already;
      return setAlready(alreadyText(last ? { at: last.at, by: last.by, decision: last.decision, reason: last.reason } : undefined));
    }
    toast(d === 'approved' ? t3('Maydon almashtirildi, xaridorlarga xabar yuborildi', 'Площадка изменена, покупатели уведомлены', 'Venue changed; buyers notified') : t3('Almashtirish rad etildi', 'Смена отклонена', 'Change declined'), 'ok');
  };
  const sold = db.tickets.filter((t) => t.ev === ev.id).length;
  return (
    <div className="space-y-6">
      {already && <Notice tone="bad">{already}</Notice>}
      {vc && vc.status === 'pending' ? (
        <>
          <Notice tone="warn" title={t3('Maydonni almashtirish tekshiruvda', 'Смена площадки на проверке', 'Venue change under review')}>
            {t3('Yuborilgan: {d}. Tasdiqlanmaguncha xaridorlar eski maydonni koʻradi, sotuv davom etadi. Sotilgan chiptalar: {n} — tasdiqdan keyin ularga SMS/email yuboriladi.', 'Отправлено: {d}. До одобрения покупатели видят прежнюю площадку, продажи идут. Продано билетов: {n} — после одобрения им уйдут SMS/email.', 'Submitted {d}. Until approved buyers see the old venue and sales go on. Tickets sold: {n}; they get an SMS/email after approval.', { d: fmtDT(vc.submittedAt), n: sold })}
          </Notice>
          <div className="grid gap-6 md:grid-cols-2">
            <VenueSide title={t3('Oldin', 'Было', 'Before')} venue={getVenue(vc.from)} lang={lang} />
            <VenueSide title={t3('Keyin', 'Стало', 'After')} venue={getVenue(vc.to)} lang={lang} other={getVenue(vc.from)} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setRet(true)}>
              <RotateCcw className="size-4" />
              {t3('Rad etish', 'Отклонить', 'Decline')}
            </Button>
            <Button variant="ok" onClick={() => setConfirm(true)}>
              <CheckCircle2 className="size-5" />
              {t3('Almashtirishni tasdiqlash', 'Одобрить смену', 'Approve the change')}
            </Button>
          </div>
        </>
      ) : (
        <Notice tone="neutral">{t3('Kutilayotgan almashtirish yoʻq.', 'Ожидающей смены нет.', 'No pending change.')}</Notice>
      )}
      <Card className="!p-4">
        <h3 className="mb-3 font-bold">{t3('Almashtirishlar tarixi', 'История смен площадки', 'Venue change history')}</h3>
        <DecisionHistory items={(ev.vcHistory || []).map((h) => ({ ...h, extra: <div className="text-sm text-ink-2">{`${getVenue(h.from)?.name || '—'} → ${getVenue(h.to)?.name || '—'}`}</div> }))} />
      </Card>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t3('Maydon almashtirilsinmi?', 'Одобрить смену площадки?', 'Approve the venue change?')} text={t3('Vitrinada yangi maydon chiqadi, sotib olingan chiptalar egalariga xabar boradi.', 'На витрине появится новая площадка, покупатели купленных билетов получат уведомление.', 'The storefront shows the new venue; buyers of sold tickets are notified.')} okLabel={t3('Tasdiqlash', 'Одобрить', 'Approve')} onOk={() => decide('approved', '')} />
      <ReasonDialog open={ret} onClose={() => setRet(false)} title={t3('Almashtirishni rad etish', 'Отклонить смену площадки', 'Decline the venue change')} hint={t3('Tadbir eski maydonda qoladi, tashkilotchi sababni koʻradi.', 'Мероприятие останется на прежней площадке, организатор увидит причину.', 'The event stays at the old venue; the organizer sees the reason.')} okLabel={t3('Rad etish', 'Отклонить', 'Decline')} onOk={(r) => decide('rework', r)} />
    </div>
  );
}

function VenueSide({ title, venue, lang, other }: { title: string; venue: Venue | undefined; lang: Lang; other?: Venue }) {
  const { t3 } = useI18n();
  const sc = venue?.halls[0] ? getScheme(venue.halls[0].schemeId) : undefined;
  const diff = (a?: string, b?: string) => other && a !== b;
  return (
    <Card>
      <div className="mb-3 text-sm font-semibold tracking-wide text-ink-3 uppercase">{title}</div>
      {venue ? (
        <>
          <div className={'text-lg font-bold ' + (diff(venue.name, other?.name) ? 'rounded bg-brand-soft px-1' : '')}>{venue.name}</div>
          <div className={'mt-1 text-ink-2 ' + (diff(venue.city + venue.address, (other?.city || '') + (other?.address || '')) ? 'rounded bg-brand-soft px-1' : '')}>{venueLine(venue, lang).split(', ').slice(1).join(', ')}</div>
          <div className="mt-1 text-sm text-ink-3">
            {venue.type === 'scheme' ? t3('Zal sxemasi', 'Схема зала', 'Seating plan') : t3('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry')}
            {venue.halls.length > 0 && ` · ${venue.halls.map((h) => h.name).join(', ')}`}
          </div>
          <div className="mt-4">{sc ? <PlanPreview scheme={sc} lang={lang} height={300} /> : <p className="text-ink-3">{t3('Sxema yoʻq (vaqt boʻyicha kirish)', 'Без схемы (вход по времени)', 'No plan (timed entry)')}</p>}</div>
        </>
      ) : (
        <p className="text-bad">{t3('Maydon topilmadi', 'Площадка не найдена', 'Venue not found')}</p>
      )}
    </Card>
  );
}
