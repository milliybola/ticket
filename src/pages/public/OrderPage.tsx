/* Order page (US-34): tickets with QR codes, PDF download through the browser print dialog, the fiscal receipt. */
import { CheckCircle2, Download, FileText, Info, Lock, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { nTickets, tl, useI18n } from '../../lib/i18n';
import { fmtPhone, maskPhone, normPhone, sum } from '../../lib/format';
import { fmtStamp } from '../../lib/time';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { findOrder, getEvent, getOrder, orderTickets, unitInfo, unitWhen } from '../../domain/rules';
import { canSeeOrder, unlockOrder } from '../../domain/purchase';
import type { Order } from '../../domain/types';
import { printElement, printOrder, ReceiptView, TicketView } from '../../components/tickets';
import { Button, Empty, Field, LinkButton, Notice, toast } from '../../components/ui';
import { PhoneField } from '../../components/purchase/parts';

export default function OrderPage() {
  const { t3 } = useI18n();
  useDb();
  const { orderId } = useParams();
  const loc = useLocation();
  const buyerId = useAuth((s) => s.buyerId);
  const [open, setOpen] = useState(false);
  const o = getOrder(orderId);
  if (!o)
    return (
      <Empty title={t3('Buyurtma topilmadi', 'Заказ не найден', 'Order not found')} className="min-h-[55vh]" action={<LinkButton to="/find-ticket">{t3('Chiptani topish', 'Найти билет', 'Find my ticket')}</LinkButton>}>
        {t3('Buyurtmani telefon va buyurtma raqami orqali toping.', 'Найдите заказ по телефону и номеру заказа.', 'Look up your order by phone and order number.')}
      </Empty>
    );
  if (!open && !canSeeOrder(o, buyerId)) return <PhoneGate order={o} onOk={() => setOpen(true)} />;
  const justPaid = !!(loc.state as { justPaid?: boolean } | null)?.justPaid;
  return <OrderView o={o} justPaid={justPaid} />;
}

/** The order number alone is not enough to open someone's tickets: ask for the buyer's phone. */
function PhoneGate({ order, onOk }: { order: Order; onOk: () => void }) {
  const { t3 } = useI18n();
  const [iso, setIso] = useState('UZ');
  const [num, setNum] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <form
        noValidate
        className="space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const phone = normPhone(iso, num);
          if (!phone) return setErr(t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number'));
          if (!findOrder(phone, order.id)) return setErr(t3('Buyurtma topilmadi', 'Заказ не найден', 'Order not found'));
          unlockOrder(order.id);
          onOk();
        }}
      >
        <div className="grid size-12 place-items-center rounded-2xl bg-brand">
          <Lock className="size-6" />
        </div>
        <h1 className="text-2xl font-bold">{t3('Buyurtma {n}', 'Заказ {n}', 'Order {n}', { n: order.id })}</h1>
        <p className="text-ink-3">{t3('Chiptalarni ochish uchun buyurtmada koʻrsatilgan telefon raqamini kiriting.', 'Чтобы открыть билеты, введите телефон, указанный в заказе.', 'To open the tickets, enter the phone number used for the order.')}</p>
        <Field label={t3('Telefon', 'Телефон', 'Phone')} required error={err}>
          <PhoneField iso={iso} num={num} onIso={setIso} onNum={(v) => (setNum(v), setErr(''))} invalid={!!err} autoFocus />
        </Field>
        <Button type="submit" block size="lg">
          {t3('Ochish', 'Открыть', 'Open')}
        </Button>
      </form>
    </div>
  );
}

function OrderView({ o, justPaid }: { o: Order; justPaid: boolean }) {
  const { t3 } = useI18n();
  const ts = orderTickets(o);
  const u = unitInfo(o.sid);
  const ev = getEvent(o.ev);
  const dl = () => {
    if (!printOrder(o)) toast(t3('Brauzer yangi oynani bloklab qoʻydi — qalqib chiquvchi oynalarga ruxsat bering', 'Браузер заблокировал окно — разрешите всплывающие окна', 'The browser blocked the window: allow pop-ups'), 'bad');
  };
  const receipt = () => {
    if (!printElement(<ReceiptView order={o} />, { title: `${o.id} — ${t3('chek', 'чек', 'receipt')}`, lang: o.lang })) toast(t3('Brauzer yangi oynani bloklab qoʻydi — qalqib chiquvchi oynalarga ruxsat bering', 'Браузер заблокировал окно — разрешите всплывающие окна', 'The browser blocked the window: allow pop-ups'), 'bad');
  };
  return (
    <div className="mx-auto max-w-[820px] px-4 py-6 md:py-10">
      {justPaid ? (
        <div className="flex items-start gap-4 rounded-[var(--radius-card)] bg-ok-soft p-5 md:p-6">
          <CheckCircle2 className="size-10 shrink-0 text-ok" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t3('Chiptalar toʻlandi', 'Билеты оплачены', 'Your tickets are paid')}</h1>
            <p className="mt-1 text-ink-2">
              {t3('Buyurtma', 'Заказ', 'Order')} <b className="font-mono text-ink">{o.id}</b> · {nTickets(ts.length)} · {sum(o.total)}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <Link to="/account" className="text-sm text-ink-3 hover:text-ink">
            {t3('Mening chiptalarim', 'Мои билеты', 'My tickets')}
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{t3('Buyurtma {n}', 'Заказ {n}', 'Order {n}', { n: o.id })}</h1>
          <p className="mt-1 text-ink-3">
            {nTickets(ts.length)} · {sum(o.total)} · {fmtStamp(o.at)}
          </p>
        </div>
      )}

      {ev && (
        <div className="mt-5 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)]">
          <Link to={`/e/${ev.id}`} className="text-lg font-bold hover:underline">
            {tl(ev.card.title)}
          </Link>
          <div className="text-ink-2">
            {u ? unitWhen(u) : ''}
            {u?.venue ? ` · ${u.venue.name}` : ''}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="lg" onClick={dl} className="flex-1 sm:flex-none">
          <Download className="size-5" />
          {t3('Chiptalarni yuklab olish (PDF)', 'Скачать билеты (PDF)', 'Download tickets (PDF)')}
        </Button>
        <Button size="lg" variant="outline" onClick={receipt} className="flex-1 sm:flex-none">
          <FileText className="size-5" />
          {t3('Chekni yuklab olish', 'Скачать чек', 'Download receipt')}
        </Button>
      </div>
      <p className="mt-2 text-sm text-ink-3">{t3('Chop etish oynasida «PDF sifatida saqlash»ni tanlang.', 'В окне печати выберите «Сохранить как PDF».', 'In the print dialog choose “Save as PDF”.')}</p>

      <Notice tone="info" className="mt-4">
        <span className="inline-flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {o.buyer.email
              ? t3('Chiptalar va chek {e} manziliga yuborildi.', 'Билеты и чек отправлены на {e}.', 'Tickets and the receipt were sent to {e}.', { e: o.buyer.email })
              : t3('Email koʻrsatilmagan: chiptalarni saqlab qoʻying. Ularni «Chiptani topish» sahifasida telefon va buyurtma raqami orqali qayta topish mumkin.', 'Email не указан: сохраните билеты. Их можно снова найти по телефону и номеру заказа на странице «Найти билет».', 'No email given: save your tickets. You can find them again with your phone and order number on the Find my ticket page.')}
            {o.ch === 'online' && ' ' + t3('Havolali SMS {p} raqamiga yuborildi.', 'SMS со ссылкой отправлено на {p}.', 'An SMS with a link went to {p}.', { p: justPaid ? fmtPhone(o.buyer.phone) : maskPhone(o.buyer.phone) })}
          </span>
        </span>
      </Notice>

      <div className="mt-6 space-y-4">
        {ts.map((t) => (
          <TicketView key={t.id} t={t} order={o} />
        ))}
      </div>

      <details className="mt-6 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)]">
        <summary className="cursor-pointer font-semibold">{t3('Fiskal chek', 'Фискальный чек', 'Fiscal receipt')}</summary>
        <div className="mt-4 overflow-x-auto">
          <ReceiptView order={o} />
        </div>
      </details>

      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton to="/" variant="outline">
          {t3('Afishaga', 'В афишу', 'Back to listings')}
        </LinkButton>
        <LinkButton to="/find-ticket" variant="ghost">
          <Search className="size-4" />
          {t3('Boshqa buyurtmani topish', 'Найти другой заказ', 'Find another order')}
        </LinkButton>
      </div>
    </div>
  );
}
