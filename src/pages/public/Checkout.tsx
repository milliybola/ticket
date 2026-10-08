/*
 * Checkout (US-30 – US-33): the 10-minute hold timer on every step, buyer details without registration,
 * museum visitors with the passport check, payment through a mock gateway, then the order.
 */
import { ArrowLeft, CreditCard, FlaskConical, Info, ShieldCheck, Smartphone, TimerOff } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { digits, sum } from '../../lib/format';
import { now, tk } from '../../lib/time';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { completeOrder, dropHold, getHold, holdAlive, itemsTotal, markPaying, PAY_METHODS, unitInfo } from '../../domain/rules';
import { cardOutcome, isCard, lastBuyer, needsVisitors, payFailText, rememberOrder, saveLastBuyer, type PayFail } from '../../domain/purchase';
import type { Buyer, Hold, PayMethod, Visitor } from '../../domain/types';
import { Button, cn, Empty, Field, Input, LinkButton, Modal, Notice, Spinner } from '../../components/ui';
import { HoldSummary, HoldTimer, Steps } from '../../components/purchase/parts';
import { BuyerForm, VisitorsForm, type VRow } from '../../components/purchase/forms';
import { clearSel, useNow } from '../../components/purchase/state';

type Step = 'data' | 'visitors' | 'pay';

export default function Checkout() {
  const { t3 } = useI18n();
  const db = useDb();
  useNow(1000);
  const { holdId } = useParams();
  const nav = useNavigate();
  const clientId = useAuth((s) => s.clientId);
  const buyerId = useAuth((s) => s.buyerId);
  const live = getHold(holdId);
  // the last version of the hold we saw: still needed to explain an expiry and to go back to the plan
  const snap = useRef<Hold | null>(null);
  if (live && live.holder === clientId) snap.current = live;
  const hold = snap.current;
  const [step, setStep] = useState<Step>('data');
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [rows, setRows] = useState<VRow[]>([]);
  const [visitors, setVisitors] = useState<(Visitor | null)[] | null>(null);
  const [phase, setPhase] = useState<'open' | 'leaving' | 'taken'>('open');
  const prefill = useMemo<Buyer | null>(() => {
    const acc = buyerId ? db.buyers.find((b) => b.id === buyerId) : null;
    return acc ? { name: acc.name, phone: acc.phone, email: acc.email } : lastBuyer();
  }, [buyerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const u = hold ? unitInfo(hold.sid) : null;
  if (!hold || !u)
    return (
      <Empty
        icon={<TimerOff className="size-10" />}
        title={t3('Bron topilmadi', 'Бронь не найдена', 'No active hold')}
        className="min-h-[55vh]"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton to="/">{t3('Afishaga', 'В афишу', 'Back to listings')}</LinkButton>
            <LinkButton to="/find-ticket" variant="outline">
              {t3('Chiptani topish', 'Найти билет', 'Find my ticket')}
            </LinkButton>
          </div>
        }
      >
        {t3('Bron vaqti tugagan yoki xarid allaqachon yakunlangan.', 'Время брони истекло или покупка уже завершена.', 'The hold has expired or the purchase is already complete.')}
      </Empty>
    );

  const ev = u.ev;
  const alive = !!live && holdAlive(live);
  const backUrl = `/e/${ev.id}/${hold.sid}`;
  const withVisitors = needsVisitors(hold, ev);
  const steps = [
    { k: 'data', label: t3('Maʼlumotlaringiz', 'Ваши данные', 'Your details') },
    ...(withVisitors ? [{ k: 'visitors', label: t3('Tashrif buyuruvchilar', 'Посетители', 'Visitors') }] : []),
    { k: 'pay', label: t3('Toʻlov', 'Оплата', 'Payment') },
  ];
  const chooseOther = () => {
    setPhase('leaving');
    if (live && !live.paying) dropHold(live.id);
    nav(backUrl);
  };
  const onPaid = (method: PayMethod): boolean => {
    const cur = getHold(hold.id) || hold;
    const res = completeOrder(cur, buyer!, withVisitors ? visitors : null, { method, at: now() });
    if (!res.ok) {
      setPhase('taken');
      return false;
    }
    setPhase('leaving');
    rememberOrder(res.order.id);
    clearSel('online', hold.sid);
    nav(`/order/${res.order.id}`, { replace: true, state: { justPaid: true } });
    return true;
  };

  return (
    <div className="mx-auto max-w-[1120px] px-4 pt-3 pb-10 md:pt-5">
      <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center justify-between gap-2 bg-page/95 px-4 py-2 backdrop-blur lg:top-20">
        <Button variant="ghost" size="sm" onClick={chooseOther} disabled={!!live?.paying}>
          <ArrowLeft className="size-4" />
          {u.museum ? t3('Boshqa vaqtni tanlash', 'Выбрать другое время', 'Choose another time') : t3('Boshqa joy tanlash', 'Выбрать другие места', 'Choose other seats')}
        </Button>
        <HoldTimer hold={live || hold} />
      </div>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">{t3('Buyurtmani rasmiylashtirish', 'Оформление заказа', 'Checkout')}</h1>
      <div className="mt-3">
        <Steps steps={steps} cur={step} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <details className="group rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] lg:hidden" open={step === 'pay'}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold">
              <span>{t3('Buyurtma', 'Заказ', 'Order')}</span>
              <span className="tabular-nums">{sum(itemsTotal(hold.items))}</span>
            </summary>
            <HoldSummary hold={hold} className="rounded-t-none shadow-none" />
          </details>
          {step === 'data' && (
            <BuyerForm
              key="data"
              online
              initial={buyer || prefill}
              consented={!!buyer}
              title={t3('Maʼlumotlaringiz', 'Ваши данные', 'Your details')}
              sub={t3('Roʻyxatdan oʻtish shart emas. Telefon chipta va ushbu tadbir haqidagi xabarlar uchun kerak.', 'Регистрация не нужна. Телефон нужен для билета и уведомлений об этом мероприятии.', 'No sign-up needed. We use your phone for the ticket and updates about this event.')}
              submitLabel={t3('Davom etish', 'Продолжить', 'Continue')}
              onSubmit={(b) => {
                setBuyer(b);
                saveLastBuyer(b);
                setStep(withVisitors ? 'visitors' : 'pay');
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          {step === 'visitors' && buyer && (
            <VisitorsForm
              hold={live || hold}
              ev={ev}
              buyerName={buyer.name}
              rows={rows}
              setRows={setRows}
              onBack={() => setStep('data')}
              onDone={(v) => {
                setVisitors(v);
                setStep('pay');
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          {step === 'pay' && buyer && <PayStep hold={live || hold} onBack={() => setStep(withVisitors ? 'visitors' : 'data')} onPaid={onPaid} />}
        </div>
        <aside className="hidden lg:sticky lg:top-40 lg:block">
          <HoldSummary hold={live || hold} />
        </aside>
      </div>

      <Modal
        open={phase === 'open' && !alive}
        onClose={() => nav(backUrl)}
        size="sm"
        title={t3('Bron vaqti tugadi', 'Время брони истекло', 'Your hold has expired')}
        footer={<Button onClick={() => nav(backUrl)}>{t3('Qaytadan tanlash', 'Выбрать заново', 'Choose again')}</Button>}
      >
        <p className="text-ink-2">{t3('Joylar yana boshqalar uchun ochiq. Agar ular hali boʻsh boʻlsa, sizga qayta taklif qilinadi.', 'Места снова доступны другим. Если они ещё свободны, вы сможете выбрать их снова.', 'The places are open to others again. If they are still free, you can pick them again.')}</p>
      </Modal>
      <Modal
        open={phase === 'taken'}
        onClose={() => nav(backUrl)}
        size="sm"
        title={t3('Joylar allaqachon sotilgan', 'Места уже проданы', 'The places are already sold')}
        footer={<Button onClick={() => nav(backUrl)}>{t3('Sxemaga qaytish', 'Вернуться к выбору', 'Back to the plan')}</Button>}
      >
        <p className="text-ink-2">
          {t3(
            'Toʻlov bron tugaganidan keyin keldi va bu joylarni boshqa xaridor sotib oldi. Sayohat yordam xizmati pulni qaytarish uchun siz bilan bogʻlanadi. Boshqa joylarni tanlashingiz mumkin.',
            'Оплата пришла после окончания брони, и эти места успел купить другой покупатель. Служба поддержки Sayohat свяжется с вами, чтобы вернуть деньги. Вы можете выбрать другие места.',
            'The payment arrived after the hold ended and someone else bought these places. Sayohat support will contact you to return the money. You can pick other places.',
          )}
        </p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- payment (US-33)

const WALLETS: PayMethod[] = ['payme', 'click', 'uzum'];
const LOGO: Record<string, string> = { payme: 'bg-[#33cccc] text-white', click: 'bg-[#0065ff] text-white', uzum: 'bg-[#7000ff] text-white', humo: 'bg-[#0b4ea2] text-white', uzcard: 'bg-[#1b3f8b] text-white', visa: 'bg-[#1a1f71] text-white', mastercard: 'bg-[#222] text-[#f79e1b]' };

function PayStep({ hold, onBack, onPaid }: { hold: Hold; onBack: () => void; onPaid: (m: PayMethod) => boolean }) {
  const { t3 } = useI18n();
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [card, setCard] = useState({ num: '', exp: '', cvc: '' });
  const [cardErr, setCardErr] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'gateway' | 'processing'>('idle');
  const busy = useRef(false);
  const total = itemsTotal(hold.items);
  const methods = PAY_METHODS.filter((p) => p.online);
  const foreign = !!method && !!PAY_METHODS.find((p) => p.id === method)?.foreign;
  const intl = method === 'visa' || method === 'mastercard';

  const run = (outcome: 'ok' | PayFail) => {
    if (busy.current) return;
    busy.current = true;
    setErr(null);
    setStage('processing');
    markPaying(hold.id, true);
    setTimeout(() => {
      if (outcome !== 'ok') {
        markPaying(hold.id, false);
        busy.current = false;
        setStage('idle');
        setErr(payFailText(outcome));
        return;
      }
      onPaid(method!);
      busy.current = false;
      setStage('idle');
    }, 1500);
  };
  const pay = () => {
    if (busy.current || !method) return;
    if (!holdAlive(getHold(hold.id))) return;
    if (isCard(method)) {
      const e: Record<string, string> = {};
      const n = digits(card.num);
      if (n.length !== 16) e.num = t3('Karta raqami 16 ta raqamdan iborat', 'Номер карты — 16 цифр', 'The card number has 16 digits');
      const m = card.exp.match(/^(\d{2})\/?(\d{2})$/);
      const cur = tk(now());
      if (!m || +m[1] < 1 || +m[1] > 12 || 2000 + +m[2] < cur.y || (2000 + +m[2] === cur.y && +m[1] < cur.m)) e.exp = t3('Amal qilish muddatini tekshiring', 'Проверьте срок действия', 'Check the expiry date');
      if (intl && !/^\d{3}$/.test(card.cvc)) e.cvc = t3('CVC — 3 ta raqam', 'CVC — 3 цифры', 'CVC: 3 digits');
      setCardErr(e);
      if (Object.keys(e).length) return;
      run(cardOutcome(n));
    } else setStage('gateway');
  };
  const name = methods.find((p) => p.id === method)?.label || '';
  return (
    <div className="space-y-5 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-6">
      <h2 className="text-xl font-bold">{t3('Toʻlov usuli', 'Способ оплаты', 'Payment method')}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t3('Toʻlov usuli', 'Способ оплаты', 'Payment method')}>
        {methods.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={method === p.id}
            onClick={() => {
              setMethod(p.id);
              setErr(null);
            }}
            className={cn('flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-sm font-semibold transition-colors', method === p.id ? 'border-ink bg-brand-soft' : 'border-line hover:border-ink-3')}
          >
            <span className={cn('grid h-8 min-w-16 place-items-center rounded-lg px-2 text-xs font-extrabold tracking-wide uppercase', LOGO[p.id])}>{p.label}</span>
            <span className="text-ink-3">{WALLETS.includes(p.id) ? t3('Ilova', 'Приложение', 'App') : t3('Karta', 'Карта', 'Card')}</span>
          </button>
        ))}
      </div>
      {method && isCard(method) && (
        <div className="grid gap-3 sm:grid-cols-[1fr_120px_100px]">
          <Field label={t3('Karta raqami', 'Номер карты', 'Card number')} error={cardErr.num}>
            <Input
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder={method === 'humo' ? '9860 •••• •••• ••••' : method === 'uzcard' ? '8600 •••• •••• ••••' : '4000 •••• •••• ••••'}
              value={card.num}
              invalid={!!cardErr.num}
              onChange={(e) => setCard({ ...card, num: digits(e.target.value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') })}
              className="font-mono"
            />
          </Field>
          <Field label={t3('Muddati', 'Срок', 'Expiry')} error={cardErr.exp}>
            <Input
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              value={card.exp}
              invalid={!!cardErr.exp}
              onChange={(e) => {
                const d = digits(e.target.value).slice(0, 4);
                setCard({ ...card, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
              }}
              className="font-mono"
            />
          </Field>
          {intl && (
            <Field label="CVC" error={cardErr.cvc}>
              <Input inputMode="numeric" autoComplete="cc-csc" type="password" maxLength={3} value={card.cvc} invalid={!!cardErr.cvc} onChange={(e) => setCard({ ...card, cvc: digits(e.target.value).slice(0, 3) })} className="font-mono" />
            </Field>
          )}
          <p className="flex items-start gap-2 text-sm text-ink-3 sm:col-span-3">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            {t3('Demo: istalgan 16 xonali raqam toʻlanadi; …0002 bilan tugasa — mablagʻ yetarli emas, …0003 — bank rad etadi.', 'Демо: любой 16-значный номер проходит; на …0002 — недостаточно средств, на …0003 — банк отклоняет.', 'Demo: any 16-digit number is paid; …0002 means insufficient funds, …0003 is declined by the bank.')}
          </p>
        </div>
      )}
      {foreign && (
        <Notice tone="info">
          <span className="inline-flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" />
            {t3('Mablagʻ soʻmda yechiladi, kursni bankingiz belgilaydi.', 'Списание в сумах, курс определяет ваш банк.', 'You are charged in UZS; your bank sets the exchange rate.')}
          </span>
        </Notice>
      )}
      {err && (
        <Notice tone="bad" title={err}>
          {t3('Bron amal qilayotgan paytda qayta urinib koʻrish mumkin.', 'Можно попробовать снова, пока действует бронь.', 'You can try again while the hold is active.')}
        </Notice>
      )}
      <p className="flex items-start gap-2 text-sm text-ink-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        {t3('Pulni Sayohat tashkilotchi agenti sifatida qabul qiladi. Har bir toʻlov uchun fiskal chek shakllantiriladi.', 'Деньги принимает Sayohat как агент организатора. На каждую оплату формируется фискальный чек.', 'Sayohat accepts payment as the organizer’s agent. Every payment gets a fiscal receipt.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={onBack} disabled={stage !== 'idle'}>
          <ArrowLeft className="size-4" />
          {t3('Orqaga', 'Назад', 'Back')}
        </Button>
        <Button size="lg" className="flex-1 sm:flex-none" disabled={!method || stage !== 'idle'} onClick={pay}>
          <CreditCard className="size-5" />
          {err ? t3('Qayta urinish', 'Попробовать снова', 'Try again') : t3('Toʻlash', 'Оплатить', 'Pay')} {sum(total)}
        </Button>
      </div>

      <Modal
        open={stage === 'gateway'}
        onClose={() => {
          setStage('idle');
          setErr(payFailText('cancel'));
        }}
        size="sm"
        title={name}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setStage('idle');
                setErr(payFailText('cancel'));
              }}
            >
              {t3('Bekor qilish', 'Отменить', 'Cancel')}
            </Button>
            <Button onClick={() => run('ok')}>{t3('Tasdiqlash', 'Подтвердить', 'Confirm')}</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className={cn('grid h-12 min-w-28 place-items-center rounded-xl px-3 text-lg font-extrabold uppercase', method ? LOGO[method] : '')}>{name}</span>
          <b className="text-2xl tabular-nums">{sum(total)}</b>
          <p className="flex items-start gap-2 text-ink-2">
            <Smartphone className="mt-0.5 size-5 shrink-0" />
            {t3('{m} ilovasida toʻlovni tasdiqlang. Bu toʻlov tizimi sahifasining demo-imitatsiyasi.', 'Подтвердите оплату в приложении {m}. Это демо-имитация страницы платёжной системы.', 'Confirm the payment in the {m} app. This stands in for the payment provider’s page.', { m: name })}
          </p>
        </div>
      </Modal>
      <Modal open={stage === 'processing'} onClose={() => undefined} size="sm">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner className="size-8" />
          <b className="text-lg">{t3('Toʻlov amalga oshirilmoqda…', 'Проводим оплату…', 'Processing the payment…')}</b>
          <p className="text-ink-3">{t3('Sahifani yopmang. Joylar toʻlov tizimi javob bermaguncha siz uchun saqlanadi.', 'Не закрывайте страницу. Места за вами, пока платёжная система не ответит.', 'Don’t close the page. The places stay yours until the payment provider answers.')}</p>
        </div>
      </Modal>
    </div>
  );
}
