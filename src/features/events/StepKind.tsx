/* Step 1: kind of event and venue (US-12), venue change of a draft or, after publication, through moderation (US-23). */
import { ArrowRight, Building2, Check, Drama, Film, Landmark, Mic, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { tl, useI18n } from '../../lib/i18n';
import { fmtStamp } from '../../lib/time';
import { byId } from '../../lib/util';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { cityName, eventSessions, getScheme, kindName, orgVenues, requestVenueChange } from '../../domain/rules';
import { capacityOf } from '../../domain/scheme';
import { EVENT_KINDS, type EventItem, type EventKind, type Venue } from '../../domain/types';
import { Badge, Button, cn, Empty, LinkButton, Notice, toast } from '../../components/ui';
import { SchemeView } from '../../components/scheme/SchemeView';
import { changeDraftVenue, createDraft, eventTickets, hasOwnPlan, KIND_HOW, venueFits } from './helpers';
import { confirmBox, Section } from './ui';

const KIND_ICON: Record<EventKind, LucideIcon> = { concert: Mic, theatre: Drama, cinema: Film, museum: Landmark, sport: Trophy, event: Sparkles };

function venueCap(v: Venue) {
  return v.halls.map((h) => {
    const sc = getScheme(h.schemeId);
    return { name: h.name, cap: sc ? capacityOf(sc) : 0 };
  });
}

function VenueTile({ v, on, onPick, disabled }: { v: Venue; on: boolean; onPick: () => void; disabled?: boolean }) {
  const { t3 } = useI18n();
  const caps = v.type === 'scheme' ? venueCap(v) : [];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-pressed={on}
      className={cn('flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors disabled:opacity-50', on ? 'border-ink bg-brand-soft' : 'border-line bg-white hover:border-line-2')}
    >
      <Building2 className="mt-0.5 size-5 shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <b className="block">{v.name}</b>
        <span className="block text-sm text-ink-3">
          {cityName(v.city)}, {v.address}
        </span>
        <span className="mt-1 block text-sm text-ink-2">
          {v.type === 'timed'
            ? t3('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry')
            : caps.map((c) => `${c.name} · ${t3('{n} joy', '{n} мест', '{n} seats', { n: c.cap })}`).join(' · ') || t3('Zallar yoʻq', 'Нет залов', 'No halls')}
        </span>
      </span>
      {on && <Check className="size-5 shrink-0" />}
    </button>
  );
}

function VenueSummary({ v, label }: { v: Venue | undefined; label: string }) {
  const { t3 } = useI18n();
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-line p-4">
      <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{label}</div>
      {v ? (
        <>
          <b className="mt-1 block">{v.name}</b>
          <span className="block text-sm text-ink-3">
            {cityName(v.city)}, {v.address}
          </span>
          <span className="mt-1 block text-sm text-ink-2">{v.type === 'timed' ? t3('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry') : v.halls.map((h) => h.name).join(', ')}</span>
        </>
      ) : (
        <span className="mt-1 block text-ink-3">—</span>
      )}
    </div>
  );
}

/**
 * Layout of the venue the event uses. One arena is set up differently for a concert, a UFC night, hockey, boxing
 * or a festival: each layout is a hall of the venue with its own plan, and the event copies the chosen one.
 */
function LayoutPicker({ v, value, onChange, disabled }: { v: Venue; value: string | null; onChange: (hallId: string) => void; disabled?: boolean }) {
  const { t3 } = useI18n();
  const halls = v.halls.slice().sort((a, b) => a.order - b.order);
  return (
    <div className="mt-5">
      <h3 className="font-semibold">{t3('Joylashuv (konfiguratsiya)', 'Конфигурация зала', 'Layout')}</h3>
      <p className="mb-3 text-sm text-ink-3">{t3('Bu maydonda bir nechta joylashuv bor. Tadbir tanlangan joylashuv sxemasining oʻz nusxasini oladi.', 'У площадки несколько конфигураций. Мероприятие получит свою копию схемы выбранной конфигурации.', 'This venue has several layouts. The event gets its own copy of the chosen layout’s plan.')}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {halls.map((h) => {
          const sc = getScheme(h.schemeId);
          const on = value === h.id;
          return (
            <button key={h.id} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange(h.id)} className={cn('overflow-hidden rounded-2xl border-2 text-left transition-colors disabled:opacity-60', on ? 'border-ink bg-brand-soft' : 'border-line bg-white hover:border-line-2')}>
              {sc && sc.els.length > 0 && (
                <div className="pointer-events-none">
                  <SchemeView scheme={sc} mode="preview" height={130} bare className="rounded-none" />
                </div>
              )}
              <span className="flex items-center justify-between gap-2 p-3">
                <span>
                  <b className="block">{h.name}</b>
                  <span className="text-sm text-ink-3">{t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: sc ? capacityOf(sc) : 0 })}</span>
                </span>
                {on && <Check className="size-5 shrink-0" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** New event: pick the kind and the venue, then the draft is created. */
export function NewEventStep() {
  const { t3 } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const nav = useNavigate();
  const org = byId(db.orgs, orgId);
  const [kind, setKind] = useState<EventKind | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [hallId, setHallId] = useState<string | null>(null);
  const mine = org?.kinds || [];
  const kinds = [...EVENT_KINDS].sort((a, b) => Number(mine.includes(b)) - Number(mine.includes(a)));
  const vs = kind ? orgVenues(orgId).filter((v) => venueFits(kind, v)) : [];
  const create = () => {
    if (!kind || !venueId) return;
    const ev = createDraft(orgId, kind, venueId, hallId);
    toast(t3('Qoralama yaratildi', 'Черновик создан', 'Draft created'), 'ok');
    nav(`/org/events/${ev.id}/card`, { replace: true });
  };
  return (
    <div className="space-y-6">
      <Section title={t3('Tadbir turi', 'Вид мероприятия', 'Kind of event')} sub={t3('Turi narxlar, seanslar va sxema qanday ishlashini belgilaydi. Keyin uni oʻzgartirib boʻlmaydi.', 'Вид определяет, как работают цены, сеансы и схема. Потом его не изменить.', 'The kind decides how prices, sessions and the plan work. It can’t be changed later.')}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kinds.map((k) => {
            const Icon = KIND_ICON[k];
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setKind(k);
                  setVenueId(null);
                }}
                className={cn('flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors', on ? 'border-ink bg-brand-soft' : 'border-line bg-white hover:border-line-2')}
              >
                <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', on ? 'bg-brand' : 'bg-black/5')}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b>{kindName(k)}</b>
                    {mine.includes(k) && <Badge tone="info">{t3('Sizning yoʻnalishingiz', 'Ваше направление', 'Your field')}</Badge>}
                  </span>
                  <span className="mt-1 block text-sm text-ink-3">{tl(KIND_HOW[k])}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      {kind && (
        <Section
          title={t3('Maydon', 'Площадка', 'Venue')}
          sub={
            kind === 'museum'
              ? t3('Muzey uchun faqat «Vaqt boʻyicha kirish» maydonlari mos.', 'Для музея подходят только площадки «Вход по времени».', 'Museums can only use timed-entry venues.')
              : hasOwnPlan(kind)
                ? t3('Sxemali maydonlar. Tadbir tanlangan joylashuv sxemasining oʻz nusxasini oladi.', 'Площадки со схемой. Мероприятие получит свою копию схемы выбранной конфигурации.', 'Venues with a seating plan. The event gets its own copy of the chosen layout’s plan.')
                : t3('Zalli kinoteatr. Har bir seans oʻz zali sxemasining nusxasini oladi.', 'Кинотеатр с залами. Каждый сеанс получит копию схемы своего зала.', 'A cinema with halls. Each showtime gets a copy of its hall’s plan.')
          }
        >
          {vs.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {vs.map((v) => (
                <VenueTile
                  key={v.id}
                  v={v}
                  on={venueId === v.id}
                  onPick={() => {
                    setVenueId(v.id);
                    setHallId(v.halls.slice().sort((a, b) => a.order - b.order)[0]?.id || null);
                  }}
                />
              ))}
            </div>
          ) : (
            <Empty
              icon={<Building2 className="size-8" />}
              title={t3('Mos maydonlar yoʻq', 'Подходящих площадок нет', 'No suitable venues')}
              action={
                <LinkButton to="/org/venues" variant="primary">
                  {t3('Maydon qoʻshish', 'Добавить площадку', 'Add a venue')}
                </LinkButton>
              }
            >
              {kind === 'museum'
                ? t3('«Vaqt boʻyicha kirish» turidagi maydon yarating.', 'Создайте площадку типа «Вход по времени».', 'Create a timed-entry venue.')
                : t3('Sxemali va kamida bitta zalli maydon yarating.', 'Создайте площадку со схемой и хотя бы одним залом.', 'Create a venue with a seating plan and at least one hall.')}
            </Empty>
          )}
          {(() => {
            const v = vs.find((x) => x.id === venueId);
            return v && hasOwnPlan(kind) && v.halls.length > 1 ? <LayoutPicker v={v} value={hallId} onChange={setHallId} /> : null;
          })()}
          <div className="mt-5 flex justify-end">
            <Button disabled={!venueId} onClick={create}>
              {t3('Yaratish va davom etish', 'Создать и продолжить', 'Create and continue')}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

/** Existing event: the kind is fixed; the venue changes at once for a draft and through moderation once published. */
export function KindVenueStep({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const v = byId(db.venues, ev.venueId);
  const [pick, setPick] = useState<string | null>(null);
  const others = orgVenues(ev.orgId).filter((x) => x.id !== ev.venueId && venueFits(ev.kind, x));
  const sold = eventTickets(ev.id).length;
  const vc = ev.venueChange?.status === 'pending' ? ev.venueChange : null;
  const draft = ev.status === 'draft' || ev.status === 'rework';
  const Icon = KIND_ICON[ev.kind];
  const lastVc = ev.vcHistory.slice(-1)[0];

  const switchDraft = async () => {
    if (!pick) return;
    const nv = byId(db.venues, pick)!;
    const ok = await confirmBox({
      title: t3('Maydonni almashtirasizmi?', 'Сменить площадку?', 'Switch the venue?'),
      text: hasOwnPlan(ev.kind)
        ? t3(
            'Tadbir «{v}» sxemasining yangi nusxasini oladi. Nomi bir xil sektorlar narxi saqlanadi, qolganlarini qayta kiriting.',
            'Мероприятие получит новую копию схемы «{v}». Цены секторов с теми же названиями сохранятся, остальные нужно задать заново.',
            'The event gets a new copy of the "{v}" plan. Prices of sectors with the same names are kept; set the others again.',
            { v: nv.name },
          )
        : t3('Tadbir «{v}» maydoniga oʻtadi.', 'Мероприятие перейдёт на площадку «{v}».', 'The event moves to "{v}".', { v: nv.name }),
      ok: t3('Almashtirish', 'Сменить', 'Switch'),
    });
    if (!ok) return;
    const r = changeDraftVenue(ev.id, pick);
    if (!r.ok) toast(r.reason, 'bad');
    else {
      toast(t3('Maydon oʻzgartirildi', 'Площадка изменена', 'Venue changed'), 'ok');
      setPick(null);
    }
  };
  const sendChange = async () => {
    if (!pick) return;
    const nv = byId(db.venues, pick)!;
    const ok = await confirmBox({
      title: t3('Maydonni almashtirish tekshiruvga yuborilsinmi?', 'Отправить смену площадки на проверку?', 'Send the venue change for review?'),
      text: t3(
        'Maydonni almashtirish tekshiruvga ketadi. Tasdiqlangunga qadar xaridorlar avvalgi maydonni koʻradi, sotuv davom etadi.',
        'Смена площадки уйдёт на проверку. До одобрения покупатели видят прежнюю площадку, продажи продолжаются.',
        'The venue change goes to a moderator. Until it’s approved, buyers see the current venue and sales go on.',
      ),
      extra: (
        <p className="text-sm">
          {v?.name} → <b>{nv.name}</b>
        </p>
      ),
      ok: t3('Yuborish', 'Отправить', 'Send'),
    });
    if (!ok) return;
    const r = requestVenueChange(ev.id, pick);
    if (!r.ok) toast(r.reason, 'bad');
    else {
      toast(t3('Maydon almashuvi tekshiruvga yuborildi', 'Смена площадки отправлена на проверку', 'Venue change sent for review'), 'ok');
      setPick(null);
    }
  };

  return (
    <div className="space-y-6">
      <Section title={t3('Tadbir turi', 'Вид мероприятия', 'Kind of event')}>
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand">
            <Icon className="size-5" />
          </span>
          <div>
            <b>{kindName(ev.kind)}</b>
            <p className="text-sm text-ink-3">{tl(KIND_HOW[ev.kind])}</p>
            <p className="mt-1 text-xs text-ink-3">{t3('Turini oʻzgartirib boʻlmaydi: kerak boʻlsa, yangi tadbir yarating.', 'Вид не меняется: при необходимости создайте новое мероприятие.', 'The kind can’t be changed: create a new event if needed.')}</p>
          </div>
        </div>
      </Section>

      <Section title={t3('Maydon', 'Площадка', 'Venue')}>
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
          <VenueSummary v={v} label={t3('Hozir', 'Сейчас', 'Current')} />
          {vc && (
            <>
              <div className="self-center text-2xl text-ink-3">→</div>
              <VenueSummary v={byId(db.venues, vc.to)} label={t3('Tekshiruvda', 'На проверке', 'Under review')} />
            </>
          )}
        </div>

        {vc && (
          <Notice tone="warn" className="mt-4" title={t3('Maydon almashuvi tekshiruvda', 'Смена площадки на проверке', 'Venue change under review')}>
            {t3(
              '{d} yuborilgan. Tasdiqlangunga qadar xaridorlar avvalgi maydonni koʻradi, sotuv va boshqa oʻzgarishlar davom etadi. Qaror chiqmaguncha ikkinchi almashuvni yuborib boʻlmaydi.',
              'Отправлено {d}. До одобрения покупатели видят прежнюю площадку, продажи и другие изменения продолжаются. Вторую смену отправить нельзя, пока нет решения.',
              'Sent {d}. Until it’s approved, buyers see the current venue; sales and other changes go on. Another change can’t be sent until there is a decision.',
              { d: fmtStamp(vc.submittedAt) },
            )}
          </Notice>
        )}
        {!vc && lastVc && lastVc.decision === 'rework' && (
          <Notice tone="bad" className="mt-4" title={t3('Maydon almashuvi rad etildi', 'Смена площадки отклонена', 'Venue change declined')}>
            {lastVc.reason} · <span className="text-sm">{lastVc.by}, {fmtStamp(lastVc.at)}</span>
          </Notice>
        )}

        {v && hasOwnPlan(ev.kind) && v.halls.length > 1 && (
          <LayoutPicker
            v={v}
            value={ev.hallId || null}
            disabled={ro || !draft || sold > 0}
            onChange={async (hid) => {
              if (hid === ev.hallId) return;
              const ok = await confirmBox({
                title: t3('Joylashuvni almashtirasizmi?', 'Сменить конфигурацию?', 'Switch the layout?'),
                text: t3('Tadbir yangi joylashuv sxemasining nusxasini oladi. Nomi bir xil sektorlar narxi saqlanadi.', 'Мероприятие получит копию схемы новой конфигурации. Цены секторов с теми же названиями сохранятся.', 'The event gets a copy of the new layout’s plan. Prices of sectors with the same names are kept.'),
                ok: t3('Almashtirish', 'Сменить', 'Switch'),
              });
              if (!ok) return;
              const r = changeDraftVenue(ev.id, v.id, hid);
              if (!r.ok) toast(r.reason, 'bad');
              else toast(t3('Joylashuv oʻzgartirildi', 'Конфигурация изменена', 'Layout changed'), 'ok');
            }}
          />
        )}
        {!ro && !vc && (
          <div className="mt-5 space-y-3">
            <h3 className="font-semibold">{draft ? t3('Boshqa maydonni tanlash', 'Выбрать другую площадку', 'Choose another venue') : t3('Maydonni almashtirish', 'Сменить площадку', 'Change the venue')}</h3>
            {!draft && (
              <Notice tone="warn">
                {t3(
                  'Maydonni almashtirish tekshiruvga ketadi. Tasdiqlangunga qadar xaridorlar avvalgi maydonni koʻradi.',
                  'Смена площадки уйдёт на проверку. До одобрения покупатели видят прежнюю площадку.',
                  'A venue change goes to a moderator. Until it’s approved, buyers see the current venue.',
                )}
              </Notice>
            )}
            {draft && ev.kind === 'cinema' && eventSessions(ev.id).length > 0 ? (
              <p className="text-sm text-ink-3">{t3('Avval seanslarni oʻchiring — ular joriy maydon zallariga bogʻlangan.', 'Сначала удалите сеансы — они привязаны к залам текущей площадки.', 'Delete the showtimes first: they belong to the current venue’s halls.')}</p>
            ) : !draft && v?.type === 'scheme' && sold > 0 ? (
              <p className="text-sm text-bad">
                {t3(
                  'Almashtirib boʻlmaydi: {n} ta chipta sotilgan. Qaytarishlar boʻlmaguncha sotilgan joylarni boshqa sxemaga koʻchirib boʻlmaydi.',
                  'Смена недоступна: продано билетов — {n}. Проданные места не перенести на другую схему, пока нет возвратов.',
                  'Not available: {n} tickets sold. Sold seats can’t move to another plan until there are refunds.',
                  { n: sold },
                )}
              </p>
            ) : others.length ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {others.map((x) => (
                    <VenueTile key={x.id} v={x} on={pick === x.id} onPick={() => setPick(x.id)} />
                  ))}
                </div>
                {!draft && sold > 0 && (
                  <p className="text-sm text-ink-3">
                    {t3('Tasdiqlangandan keyin {n} ta chipta egalariga SMS va email boradi.', 'После одобрения владельцы {n} билетов получат SMS и email.', 'After approval, the holders of {n} tickets get an SMS and an email.', { n: sold })}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button disabled={!pick} onClick={draft ? switchDraft : sendChange}>
                    {draft ? t3('Maydonni almashtirish', 'Сменить площадку', 'Switch venue') : t3('Tekshiruvga yuborish', 'Отправить на проверку', 'Send for review')}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-3">
                {t3('Boshqa mos maydonlar yoʻq.', 'Других подходящих площадок нет.', 'No other suitable venues.')}{' '}
                <Link to="/org/venues" className="underline">
                  {t3('Maydon qoʻshish', 'Добавить площадку', 'Add a venue')}
                </Link>
              </p>
            )}
          </div>
        )}
        {ro && <p className="mt-4 text-sm text-ink-3">{t3('Tadbir moderatsiyada ekan, maydonni oʻzgartirib boʻlmaydi.', 'Пока мероприятие на модерации, площадку не изменить.', 'You can’t change the venue while the event is in moderation.')}</p>}

        {ev.vcHistory.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 font-semibold">{t3('Maydon almashuvlari tarixi', 'История смен площадки', 'Venue change history')}</h3>
            <ul className="space-y-2 text-sm">
              {ev.vcHistory
                .slice()
                .reverse()
                .map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Badge tone={h.decision === 'approved' ? 'ok' : 'bad'}>{h.decision === 'approved' ? t3('Tasdiqlandi', 'Одобрено', 'Approved') : t3('Rad etildi', 'Отклонено', 'Declined')}</Badge>
                    <span>
                      {byId(db.venues, h.from)?.name || '—'} → {byId(db.venues, h.to)?.name || '—'}
                    </span>
                    {h.reason && <span className="text-ink-3">· {h.reason}</span>}
                    <span className="text-ink-3">
                      · {h.by}, {fmtStamp(h.at)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Section>
      <div className="flex justify-end">
        <Button onClick={onNext}>
          {t3('Davom etish', 'Далее', 'Continue')}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
