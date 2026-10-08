/* Electronic / printed ticket and fiscal receipt (US-34, US-37). Used by the order page, the account and the box office. */
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { t3, tl, withLang, type Lang } from '../lib/i18n';
import { fmtDT, fmtStamp } from '../lib/time';
import { fmtPhone, maskDoc, nfmt } from '../lib/format';
import { cityName, getEvent, kindName, orderTickets, PAY_METHODS, unitInfo, unitWhen } from '../domain/rules';
import type { Order, Ticket } from '../domain/types';
import { Qr } from './common';

export function TicketView({ t, order, copy = false }: { t: Ticket; order: Order; copy?: boolean }) {
  const u = unitInfo(t.sid);
  const ev = getEvent(t.ev);
  if (!ev) return null;
  const venue = u?.venue;
  const postponed = u?.session?.postponed?.length ? u.session.postponed[0].from : null;
  return (
    <div className="ticket relative flex w-full flex-col sm:flex-row max-w-[720px] overflow-hidden rounded-2xl border border-line bg-white text-ink" style={{ breakInside: 'avoid' }}>
      <div className="min-w-0 flex-1 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-brand px-2 py-0.5 text-xs font-bold">SAYOHAT</span>
          <span className="text-xs text-ink-3">
            {kindName(ev.kind)}
            {ev.card.age ? ` · ${ev.card.age}` : ''}
          </span>
        </div>
        <div className="mt-3 text-xl leading-tight font-bold">{tl(ev.card.title)}</div>
        <div className="mt-1 font-semibold">{u ? unitWhen(u) : ''}</div>
        {postponed && <div className="mt-1 text-sm font-semibold text-warn">{t3('{d} dan koʻchirildi', 'Перенесено с {d}', 'Moved from {d}', { d: fmtDT(postponed) })}</div>}
        <div className="mt-1 text-sm text-ink-2">
          {venue ? `${venue.name}, ${cityName(venue.city)}, ${venue.address}` : ''}
          {u?.hall && u.venue && u.venue.halls.length > 1 ? ` · ${u.hall.name}` : ''}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-ink-3">{t3('Joy', 'Место', 'Place')}</div>
            <div className="font-semibold">{tl(t.lb)}</div>
          </div>
          <div>
            <div className="text-ink-3">{t3('Narx', 'Цена', 'Price')}</div>
            <div className="font-semibold">{nfmt(t.p)} {t3('soʻm', 'сум', 'UZS')}</div>
          </div>
          {t.tn && (
            <div className="col-span-2">
              <div className="text-ink-3">{t3('Chipta turi', 'Тип билета', 'Ticket type')}</div>
              <div className="font-semibold">
                {tl(t.tn)}
                {t.rq ? <span className="font-normal text-warn"> — {tl(t.rq)}</span> : null}
              </div>
            </div>
          )}
          <div className="col-span-2">
            <div className="text-ink-3">{t.v ? t3('Tashrif buyuruvchi', 'Посетитель', 'Visitor') : t3('Xaridor', 'Покупатель', 'Buyer')}</div>
            <div className="font-semibold">
              {t.v ? `${t.v.name} · ${t.v.citizen ? '' : (t.v.country || '') + ' '}${maskDoc(t.v.doc)}` : order.buyer.name}
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col items-center justify-center gap-2 border-t-2 border-dashed border-line p-4 sm:w-[190px] sm:border-t-0 sm:border-l-2">
        <Qr text={t.code} size={150} />
        <div className="font-mono text-xs">{order.id}</div>
        {copy && <div className="rounded bg-ink px-2 py-0.5 text-xs font-bold text-white">{t3('NUSXA', 'КОПИЯ', 'COPY')}</div>}
      </div>
    </div>
  );
}

export function ReceiptView({ order }: { order: Order }) {
  const ev = getEvent(order.ev);
  const tickets = orderTickets(order);
  const method = PAY_METHODS.find((p) => p.id === order.pay.method)?.label || order.pay.method;
  return (
    <div className="receipt mx-auto w-[300px] bg-white p-4 font-mono text-[12px] leading-snug text-ink" style={{ breakInside: 'avoid' }}>
      <div className="text-center font-bold">SAYOHAT TICKETS</div>
      <div className="text-center">{t3('Organizator agenti sifatida', 'Агент организатора', 'Agent of the organizer')}</div>
      <div className="my-2 border-t border-dashed border-ink" />
      <div>{t3('Fiskal chek', 'Фискальный чек', 'Fiscal receipt')} № {order.fiscal.no}</div>
      <div>{fmtStamp(order.fiscal.at)}</div>
      <div>{t3('Buyurtma', 'Заказ', 'Order')}: {order.id}</div>
      <div className="my-2 border-t border-dashed border-ink" />
      <div className="font-bold">{ev ? tl(ev.card.title) : ''}</div>
      {tickets.map((t) => (
        <div key={t.id} className="flex justify-between gap-2">
          <span className="min-w-0 truncate">{tl(t.lb)}{t.tn ? ` (${tl(t.tn)})` : ''}</span>
          <span>{nfmt(t.p)}</span>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-ink" />
      <div className="flex justify-between font-bold">
        <span>{t3('JAMI', 'ИТОГО', 'TOTAL')}</span>
        <span>{nfmt(order.total)}</span>
      </div>
      <div className="flex justify-between">
        <span>{t3('Toʻlov', 'Оплата', 'Payment')}</span>
        <span>{method}</span>
      </div>
      {order.pay.received ? (
        <>
          <div className="flex justify-between">
            <span>{t3('Olindi', 'Получено', 'Received')}</span>
            <span>{nfmt(order.pay.received)}</span>
          </div>
          <div className="flex justify-between">
            <span>{t3('Qaytim', 'Сдача', 'Change')}</span>
            <span>{nfmt(order.pay.received - order.total)}</span>
          </div>
        </>
      ) : null}
      <div className="my-2 border-t border-dashed border-ink" />
      <div>{t3('Terminal', 'Терминал', 'Terminal')}: {order.fiscal.terminal}</div>
      <div>{t3('Fiskal belgi', 'Фискальный признак', 'Fiscal sign')}: {order.fiscal.sign}</div>
      <div>{fmtPhone(order.buyer.phone)}</div>
      <div className="mt-2 flex justify-center">
        <Qr text={`https://ofd.soliq.uz/check?t=${order.fiscal.terminal}&r=${order.fiscal.no}&s=${order.fiscal.sign}`} size={110} />
      </div>
    </div>
  );
}

/**
 * Prints React content in a separate window (tickets on A4 or an 80 mm tape, receipts).
 * Tailwind styles are copied from this document so the print looks like the screen.
 */
export function printElement(node: ReactElement, opts: { title?: string; tape?: boolean; lang?: Lang } = {}) {
  const html = opts.lang ? withLang(opts.lang, () => renderToStaticMarkup(node)) : renderToStaticMarkup(node);
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  const styles = [...document.querySelectorAll('style,link[rel="stylesheet"]')].map((n) => n.outerHTML).join('\n');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${opts.title || 'Sayohat'}</title>${styles}
<style>@page{size:${opts.tape ? '80mm auto' : 'A4'};margin:${opts.tape ? '2mm' : '12mm'}}body{background:#fff!important;padding:0;margin:0}.wrap{display:flex;flex-direction:column;gap:12px;align-items:center;padding:8px}${opts.tape ? '.ticket{flex-direction:column;max-width:76mm}.ticket>div:last-child{border-left:0;border-top:2px dashed #ddd;width:auto}' : ''}</style>
</head><body><div class="wrap">${html}</div><script>window.onload=function(){setTimeout(function(){window.print();},300)}</script></body></html>`);
  w.document.close();
  return true;
}

export function printOrder(order: Order, opts: { copy?: boolean; tape?: boolean; receipt?: boolean } = {}) {
  const tickets = orderTickets(order);
  return printElement(
    <>
      {tickets.map((t) => (
        <TicketView key={t.id} t={t} order={order} copy={opts.copy} />
      ))}
      {opts.receipt && <ReceiptView order={order} />}
    </>,
    { title: order.id, tape: opts.tape, lang: order.lang },
  );
}
