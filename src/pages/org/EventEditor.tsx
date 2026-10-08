/* Organizer event editor (US-12 … US-24, US-39): a stepper over kind & venue, card, plan, prices, sessions, check & submit. */
import { ArrowLeft, Check, Clock, Eye, Trash2 } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router';
import { tl, useI18n } from '../../lib/i18n';
import { fmtStamp } from '../../lib/time';
import { byId } from '../../lib/util';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { cityName, eventChecklist, evTitle, kindName, STATUS, type CheckItem } from '../../domain/rules';
import type { EventItem } from '../../domain/types';
import { Poster } from '../../components/common';
import { Badge, Button, cn, Empty, LinkButton, Notice, toast } from '../../components/ui';
import { canDeleteEvent, deleteEvent, nextStep, STATUS_TONE, STEP_KEYS, stepLabel, stepsOf, type StepKey } from '../../features/events/helpers';
import { ConfirmHost, confirmBox } from '../../features/events/ui';
import { KindVenueStep, NewEventStep } from '../../features/events/StepKind';
import { CardStep } from '../../features/events/StepCard';
import { PlanStep } from '../../features/events/StepPlan';
import { PricesStep } from '../../features/events/StepPrices';
import { SessionsStep } from '../../features/events/StepSessions';
import { useEnsureEventPlan } from '../../sync/iticket';
import { SubmitStep } from '../../features/events/StepSubmit';


const STEP_CHECK: Partial<Record<StepKey, CheckItem['key']>> = { card: 'card', prices: 'prices', sessions: 'sessions' };
function stepOk(ev: EventItem, k: StepKey, cl: CheckItem[]) {
  const ok = (key: CheckItem['key']) => !!cl.find((c) => c.key === key)?.ok;
  if (k === 'kind') return !!ev.venueId && (ev.kind === 'museum' ? ok('venue') : true);
  if (k === 'plan') return ok('venue');
  if (k === 'submit') return ev.status === 'published' || ev.status === 'moderation';
  return ok(STEP_CHECK[k]!);
}

function Stepper({ ev, cur }: { ev: EventItem | null; cur: StepKey }) {
  useI18n();
  const steps = ev ? stepsOf(ev.kind) : STEP_KEYS;
  const cl = ev ? eventChecklist(ev) : [];
  return (
    <nav aria-label="Steps" className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      {steps.map((k, i) => {
        const ok = ev ? stepOk(ev, k, cl) : false;
        const on = k === cur;
        const label = stepLabel(k, ev?.kind);
        const cls = cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-medium transition-colors', on ? 'bg-ink text-white' : ev ? 'text-ink-2 hover:bg-black/5' : 'text-ink-3');
        const badge = (
          <span className={cn('grid size-6 place-items-center rounded-full text-xs font-bold', on ? 'bg-brand text-ink' : ok ? 'bg-ok text-white' : 'bg-black/5')}>{ok && !on ? <Check className="size-3.5" /> : i + 1}</span>
        );
        return ev ? (
          <Link key={k} to={`/org/events/${ev.id}/${k}`} className={cls} aria-current={on ? 'step' : undefined}>
            {badge}
            {label}
          </Link>
        ) : (
          <span key={k} className={cls} aria-current={on ? 'step' : undefined}>
            {badge}
            {label}
          </span>
        );
      })}
    </nav>
  );
}

export default function EventEditor() {
  const { t3 } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId);
  const { eventId, step } = useParams();
  const nav = useNavigate();
  // events imported from iticket get their plan, prices and ticket types when first opened
  useEnsureEventPlan(eventId ? byId(db.events, eventId) : null);

  if (!eventId)
    return (
      <div>
        <BackLink />
        <h1 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">{t3('Yangi tadbir', 'Новое мероприятие', 'New event')}</h1>
        <p className="mb-6 text-ink-3">{t3('Qoralama har bir qadamdan keyin saqlanadi — unga keyinroq qaytish mumkin.', 'Черновик сохраняется после каждого шага — к нему можно вернуться позже.', 'The draft is saved after every step, so you can come back to it later.')}</p>
        <Stepper ev={null} cur="kind" />
        <NewEventStep />
        <ConfirmHost />
      </div>
    );

  const ev = byId(db.events, eventId);
  if (!ev || ev.orgId !== orgId)
    return (
      <Empty title={t3('Tadbir topilmadi', 'Мероприятие не найдено', 'Event not found')} className="min-h-[50vh]" action={<LinkButton to="/org/events">{t3('Tadbirlar', 'Мероприятия', 'Events')}</LinkButton>}>
        {t3('U oʻchirilgan yoki boshqa tashkilotchiga tegishli.', 'Оно удалено или принадлежит другому организатору.', 'It was deleted or belongs to another organizer.')}
      </Empty>
    );

  const steps = stepsOf(ev.kind);
  const cur: StepKey = steps.includes(step as StepKey) ? (step as StepKey) : 'card';
  const ro = ev.status === 'moderation';
  const venue = byId(db.venues, ev.venueId);
  const goNext = () => nav(`/org/events/${ev.id}/${nextStep(ev.kind, cur)}`);
  const lastRework = ev.history.filter((h) => h.decision === 'rework').slice(-1)[0];

  const remove = async () => {
    const ok = await confirmBox({
      title: t3('Tadbir oʻchirilsinmi?', 'Удалить мероприятие?', 'Delete this event?'),
      text: t3('«{t}» va uning seanslari oʻchiriladi.', '«{t}» и его сеансы будут удалены.', '"{t}" and its sessions will be deleted.', { t: evTitle(ev) }),
      danger: true,
      ok: t3('Oʻchirish', 'Удалить', 'Delete'),
    });
    if (!ok) return;
    deleteEvent(ev.id);
    toast(t3('Tadbir oʻchirildi', 'Мероприятие удалено', 'Event deleted'), 'ok');
    nav('/org/events', { replace: true });
  };

  const body = (() => {
    switch (cur) {
      case 'kind':
        return <KindVenueStep ev={ev} ro={ro} onNext={goNext} />;
      case 'card':
        return <CardStep key={ev.id} ev={ev} ro={ro} onNext={goNext} />;
      case 'plan':
        return <PlanStep key={ev.schemeId || ev.venueId || ''} ev={ev} ro={ro} onNext={goNext} />;
      case 'prices':
        return <PricesStep ev={ev} ro={ro} onNext={goNext} />;
      case 'sessions':
        return <SessionsStep ev={ev} ro={ro} onNext={goNext} />;
      case 'submit':
        return <SubmitStep ev={ev} />;
    }
  })();

  return (
    <div>
      <BackLink />
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="h-20 w-15 shrink-0 overflow-hidden rounded-xl shadow-[var(--shadow-card)]">
          <Poster card={ev.card} showTitle={false} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{evTitle(ev)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-3">
            <Badge tone={STATUS_TONE[ev.status]}>{tl(STATUS[ev.status])}</Badge>
            <span>{kindName(ev.kind)}</span>
            {venue && (
              <span>
                · {venue.name}, {cityName(venue.city)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ev.status === 'published' && (
            <LinkButton to={`/e/${ev.id}`} variant="outline" size="sm">
              <Eye className="size-4" />
              {t3('Xaridor qanday koʻradi', 'Как увидит покупатель', 'Buyer view')}
            </LinkButton>
          )}
          {canDeleteEvent(ev) && (
            <Button variant="ghost" size="sm" className="text-bad" onClick={remove}>
              <Trash2 className="size-4" />
              {t3('Qoralamani oʻchirish', 'Удалить черновик', 'Delete draft')}
            </Button>
          )}
        </div>
      </div>

      {ev.status === 'moderation' && (
        <Notice
          tone="warn"
          className="mb-5"
          title={
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" />
              {t3('{d} dan moderatsiyada', 'На модерации с {d}', 'In moderation since {d}', { d: fmtStamp(ev.submittedAt || ev.createdAt) })}
            </span>
          }
          action={
            cur !== 'submit' ? (
              <LinkButton to={`/org/events/${ev.id}/submit`} variant="outline" size="sm">
                {t3('Arizani qaytarib olish', 'Отозвать заявку', 'Withdraw')}
              </LinkButton>
            ) : undefined
          }
        >
          {t3('Qaror emailga keladi. Ariza tekshiruvda ekan, tadbirni oʻzgartirib boʻlmaydi — kerak boʻlsa, arizani qaytarib oling.', 'Решение придёт на email. Пока заявка на проверке, мероприятие нельзя изменить — отзовите заявку, если нужно что-то поправить.', 'The decision will arrive by email. While under review the event can’t be edited; withdraw it if you need to change something.')}
        </Notice>
      )}
      {ev.status === 'rework' && lastRework && (
        <Notice
          tone="bad"
          className="mb-5"
          title={t3('Tuzatish kerak', 'Нужно исправить', 'Changes needed')}
          action={
            cur !== 'submit' ? (
              <LinkButton to={`/org/events/${ev.id}/submit`} size="sm">
                {t3('Qayta yuborish', 'Отправить снова', 'Resubmit')}
              </LinkButton>
            ) : undefined
          }
        >
          <p>{lastRework.reason}</p>
          <p className="mt-1 text-sm">
            {lastRework.by} · {fmtStamp(lastRework.at)}
          </p>
        </Notice>
      )}
      {ev.status === 'published' && (
        <Notice tone="ok" className="mb-5" title={t3('Eʼlon qilingan', 'Опубликовано', 'Published')}>
          {t3(
            'Seans, narx, chipta turi va tavsifdagi oʻzgarishlar darhol vitrina va kassada paydo boʻladi. Maydonni almashtirish tekshiruvdan oʻtadi.',
            'Изменения сеансов, цен, типов и описания сразу появятся на витрине и в кассе. Смена площадки проходит проверку.',
            'Changes to sessions, prices, types and the description go live on the storefront and at the box office at once. A venue change is reviewed.',
          )}
        </Notice>
      )}
      {ev.status === 'draft' && cur !== 'submit' && (
        <p className="mb-4 text-sm text-ink-3">{t3('Qoralama: xaridorlar uni koʻrmaydi. Har bir qadam saqlangandan keyin unga qaytish mumkin.', 'Черновик: покупатели его не видят. После каждого шага можно вернуться к нему позже.', 'Draft: buyers don’t see it. You can come back to it after any step.')}</p>
      )}

      <Stepper ev={ev} cur={cur} />
      {cur === 'submit' ? (
        body
      ) : (
        <fieldset disabled={ro} className={cn('min-w-0', ro && 'opacity-90')}>
          {body}
        </fieldset>
      )}
      <ConfirmHost />
    </div>
  );
}

function BackLink() {
  const { t3 } = useI18n();
  return (
    <Link to="/org/events" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" />
      {t3('Tadbirlar', 'Мероприятия', 'Events')}
    </Link>
  );
}
