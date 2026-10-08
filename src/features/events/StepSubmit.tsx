/* Step 6: checklist and submission for moderation (US-21), withdrawal, rework reason, published summary. */
import { CheckCircle2, Eye, Send, Store, Undo2, XCircle } from 'lucide-react';
import { Link } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { sum } from '../../lib/format';
import { fmtStamp, now } from '../../lib/time';
import { byId, sumBy } from '../../lib/util';
import { useDb } from '../../store/db';
import { eventChecklist, eventSessions, getEvent, submitEvent, withdrawEvent, type CheckItem } from '../../domain/rules';
import type { Decision, EventItem } from '../../domain/types';
import { Badge, Button, LinkButton, Notice, Stat, toast } from '../../components/ui';
import type { StepKey } from './helpers';
import { confirmBox, Section } from './ui';

export const checkStep = (ev: EventItem, k: CheckItem['key']): StepKey => {
  if (k === 'card') return 'card';
  if (k === 'prices') return 'prices';
  if (k === 'sessions') return 'sessions';
  return !ev.venueId || ev.kind === 'museum' ? 'kind' : 'plan';
};

export function decisionLabel(h: Decision, t3: (u: string, r: string, e: string) => string) {
  return {
    submitted: t3('Moderatsiyaga yuborildi', 'Отправлено на модерацию', 'Sent for moderation'),
    resubmitted: t3('Qayta yuborildi', 'Отправлено повторно', 'Resubmitted'),
    approved: t3('Eʼlon qilindi', 'Опубликовано', 'Published'),
    rework: t3('Tuzatishga qaytarildi', 'Возвращено на доработку', 'Returned for changes'),
    withdrawn: t3('Ariza qaytarib olindi', 'Заявка отозвана', 'Withdrawn'),
  }[h.decision];
}

export function History({ list }: { list: Decision[] }) {
  const { t3 } = useI18n();
  if (!list.length) return <p className="text-ink-3">{t3('Hali arizalar boʻlmagan.', 'Заявок ещё не было.', 'Not submitted yet.')}</p>;
  return (
    <ol className="space-y-3">
      {list
        .slice()
        .reverse()
        .map((h, i) => (
          <li key={i} className="border-l-2 border-line pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={h.decision === 'approved' ? 'ok' : h.decision === 'rework' ? 'bad' : h.decision === 'withdrawn' ? 'neutral' : 'info'}>{decisionLabel(h, t3)}</Badge>
              <span className="text-sm text-ink-3">
                {fmtStamp(h.at)}
                {h.by && ` · ${h.by}`}
              </span>
            </div>
            {h.reason && <p className="mt-1 text-[15px]">{h.reason}</p>}
          </li>
        ))}
    </ol>
  );
}

export function SubmitStep({ ev }: { ev: EventItem }) {
  const { t3 } = useI18n();
  const db = useDb();
  const org = byId(db.orgs, ev.orgId);
  const cl = eventChecklist(ev);
  const allOk = cl.every((c) => c.ok);
  const approved = org?.status === 'approved';

  const submit = async () => {
    const r = submitEvent(ev.id);
    if (r.ok) toast(t3('Moderatsiyaga yuborildi. Qaror emailga keladi.', 'Отправлено на модерацию. Решение придёт на email.', 'Sent for moderation. The decision will arrive by email.'), 'ok');
    else toast(r.reason, 'bad');
  };
  const withdraw = async () => {
    const ok = await confirmBox({
      title: t3('Ariza qaytarib olinsinmi?', 'Отозвать заявку?', 'Withdraw from moderation?'),
      text: t3('Tadbir qoralamaga qaytadi va moderator roʻyxatidan yoʻqoladi.', 'Мероприятие вернётся в черновик и пропадёт из списка модератора.', 'The event goes back to draft and leaves the moderators’ queue.'),
      ok: t3('Qaytarib olish', 'Отозвать', 'Withdraw'),
    });
    if (!ok) return;
    withdrawEvent(ev.id);
    const cur = getEvent(ev.id);
    toast(cur?.status === 'draft' ? t3('Ariza qaytarib olindi', 'Заявка отозвана', 'Withdrawn') : t3('Moderator allaqachon qaror qabul qildi', 'Модератор уже принял решение', 'A moderator has already decided'), cur?.status === 'draft' ? 'ok' : 'bad');
  };

  if (ev.status === 'published') return <PublishedSummary ev={ev} />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t3('Yuborishdan oldin', 'Перед отправкой', 'Before you submit')}>
        <ul className="space-y-3">
          {cl.map((c) => (
            <li key={c.key} className="flex items-start gap-3">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-bad" />}
              <div className="min-w-0 flex-1">
                <b>{c.label}</b>
                {!c.ok && <p className="text-sm text-ink-3">{c.hint}</p>}
              </div>
              {!c.ok && ev.status !== 'moderation' && (
                <LinkButton to={`/org/events/${ev.id}/${checkStep(ev, c.key)}`} variant="outline" size="sm">
                  {t3('Tuzatish', 'Исправить', 'Fix')}
                </LinkButton>
              )}
            </li>
          ))}
        </ul>
        {!approved && (
          <Notice tone="warn" className="mt-5" title={t3('Avval tashkilotchi tekshiruvi kerak', 'Сначала нужна проверка организатора', 'Your organizer account must be approved first')}>
            {t3('Moderator anketangizni tasdiqlagach, tadbirni yuborish mumkin boʻladi.', 'Когда модератор одобрит вашу анкету, мероприятие можно будет отправить.', 'Once a moderator approves your application, you can send the event.')}{' '}
            <Link to="/org/application" className="underline">
              {t3('Anketa', 'Анкета', 'Application')}
            </Link>
          </Notice>
        )}
        <div className="mt-6">
          {ev.status === 'moderation' ? (
            <div className="space-y-3">
              <Notice tone="info">{t3('{d} yuborilgan. Qaror emailga keladi.', 'Отправлено {d}. Решение придёт на email.', 'Sent {d}. The decision will arrive by email.', { d: fmtStamp(ev.submittedAt || now()) })}</Notice>
              <Button variant="outline" onClick={withdraw}>
                <Undo2 className="size-4" />
                {t3('Arizani qaytarib olish', 'Отозвать заявку', 'Withdraw')}
              </Button>
            </div>
          ) : (
            <Button size="lg" disabled={!allOk || !approved} onClick={submit}>
              <Send className="size-5" />
              {ev.status === 'rework' ? t3('Qayta yuborish', 'Отправить повторно', 'Resubmit') : t3('Moderatsiyaga yuborish', 'Отправить на модерацию', 'Send for moderation')}
            </Button>
          )}
        </div>
      </Section>
      <Section title={t3('Tarix', 'История', 'History')}>
        <History list={ev.history} />
      </Section>
    </div>
  );
}

function PublishedSummary({ ev }: { ev: EventItem }) {
  const { t3 } = useI18n();
  const db = useDb();
  const tickets = db.tickets.filter((t) => t.ev === ev.id);
  const on = tickets.filter((t) => t.ch === 'online');
  const box = tickets.filter((t) => t.ch === 'box');
  const upcoming = ev.kind === 'museum' ? null : eventSessions(ev.id).filter((s) => s.startsAt > now()).length;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t3('Sotilgan chiptalar', 'Продано билетов', 'Tickets sold')} value={tickets.length} />
        <Stat label={t3('Tushum', 'Выручка', 'Revenue')} value={sum(sumBy(tickets, (t) => t.p))} />
        <Stat label={t3('Onlayn / kassa', 'Онлайн / касса', 'Online / box office')} value={`${on.length} / ${box.length}`} sub={`${sum(sumBy(on, (t) => t.p))} / ${sum(sumBy(box, (t) => t.p))}`} />
        <Stat label={ev.kind === 'museum' ? t3('Grafik', 'График', 'Schedule') : t3('Kelgusi seanslar', 'Будущих сеансов', 'Upcoming sessions')} value={upcoming ?? t3('Har kuni', 'Ежедневно', 'Daily')} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t3('Tadbir eʼlon qilingan', 'Мероприятие опубликовано', 'The event is live')}>
          <p>{t3('{d} eʼlon qilingan. Sotuv onlayn va kassada ochiq.', 'Опубликовано {d}. Продажи открыты онлайн и в кассе.', 'Published {d}. On sale online and at the box office.', { d: fmtStamp(ev.firstPublishedAt || now()) })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton to={`/e/${ev.id}`} variant="outline">
              <Eye className="size-4" />
              {t3('Vitrinadagi sahifa', 'Страница на витрине', 'Storefront page')}
            </LinkButton>
            <LinkButton to="/org/box" variant="outline">
              <Store className="size-4" />
              {t3('Kassa', 'Касса', 'Box office')}
            </LinkButton>
          </div>
          <p className="mt-4 text-sm text-ink-3">
            {t3(
              'Seanslar, narxlar, chipta turlari va tavsif moderatsiyasiz darhol oʻzgaradi. Maydonni almashtirish tekshiruvdan oʻtadi. Eʼlon qilingan tadbirni oʻchirib boʻlmaydi.',
              'Сеансы, цены, типы билетов и описание меняются сразу, без модерации. Смена площадки проходит проверку. Опубликованное мероприятие удалить нельзя.',
              'Sessions, prices, ticket types and the description change at once, without moderation. A venue change is reviewed. A published event can’t be deleted.',
            )}
          </p>
        </Section>
        <Section title={t3('Qarorlar tarixi', 'История решений', 'Decision history')}>
          <History list={ev.history} />
        </Section>
      </div>
    </div>
  );
}
