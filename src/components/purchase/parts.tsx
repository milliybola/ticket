/* Small building blocks of the purchase path: phone input, hold timer, order summary, step indicator. */
import { Check, Clock, Info } from 'lucide-react';
import { nTickets, tl, useI18n } from '../../lib/i18n';
import { COUNTRIES, sum, usd } from '../../lib/format';
import { mmss } from '../../lib/time';
import { itemCount, itemsTotal, unitInfo, unitWhen, type Unit } from '../../domain/rules';
import type { Hold } from '../../domain/types';
import { Poster } from '../common';
import { cn, Input, Select } from '../ui';
import { useNow } from './state';

/** Country code + local number. Value is kept as { iso, num }; normPhone() turns it into E.164. */
export function PhoneField({ iso, num, onIso, onNum, invalid, id, autoFocus }: { iso: string; num: string; onIso: (v: string) => void; onNum: (v: string) => void; invalid?: boolean; id?: string; autoFocus?: boolean }) {
  const { t3 } = useI18n();
  const c = COUNTRIES.find((x) => x.iso === iso) || COUNTRIES[0];
  return (
    <div className="flex gap-2">
      <Select value={iso} onChange={(e) => onIso(e.target.value)} className="w-[104px] shrink-0 pr-7" aria-label={t3('Mamlakat kodi', 'Код страны', 'Country code')} title={tl(c.name)}>
        {COUNTRIES.map((x) => (
          <option key={x.iso} value={x.iso}>
            {x.iso} +{x.code}
          </option>
        ))}
      </Select>
      <Input
        id={id}
        autoFocus={autoFocus}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={num}
        invalid={invalid}
        onChange={(e) => onNum(e.target.value.replace(/[^\d\s()+-]/g, ''))}
        placeholder={iso === 'UZ' ? '90 123 45 67' : ''}
        className="min-w-0 flex-1"
      />
    </div>
  );
}

/** "Seats held for 09:59" at the top of every checkout step; red under one minute (US-30). */
export function HoldTimer({ hold, className }: { hold: Hold; className?: string }) {
  const { t3 } = useI18n();
  const t = useNow(1000);
  const left = hold.expiresAt - t;
  const late = left < 60_000;
  if (hold.paying && left <= 0)
    return (
      <div className={cn('flex items-center gap-2 rounded-2xl bg-info-soft px-4 py-2.5 text-info', className)} role="timer">
        <Clock className="size-5 shrink-0" />
        <span className="font-medium">{t3('Toʻlov tizimi javobini kutyapmiz — joylar siz uchun saqlanadi', 'Ждём ответа платёжной системы — места за вами', 'Waiting for the payment provider: the places stay yours')}</span>
      </div>
    );
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-2xl px-4 py-2.5', late ? 'bg-bad-soft text-bad' : 'bg-white text-ink shadow-[var(--shadow-card)]', className)} role="timer" aria-live="off">
      <Clock className="size-5 shrink-0" />
      <span className="font-medium">{t3('Joylar ushlab turiladi', 'Места держатся', 'Seats held for')}</span>
      <b className="font-mono text-lg tabular-nums">{mmss(left)}</b>
      {late && <em className="w-full text-sm font-semibold not-italic sm:w-auto">{t3('Bir daqiqadan kam qoldi', 'Осталось меньше минуты', 'Less than a minute left')}</em>}
    </div>
  );
}

/** Order summary: event, date, places or slot, ticket types with requirements, total in soʻm and ≈ $. */
export function HoldSummary({ hold, showUsd = true, className }: { hold: Hold; showUsd?: boolean; className?: string }) {
  const { t3 } = useI18n();
  const u = unitInfo(hold.sid);
  if (!u) return null;
  const total = itemsTotal(hold.items);
  const types = u.ev.types || [];
  return (
    <div className={cn('rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-5', className)}>
      <UnitHead u={u} />
      <ul className="mt-4 space-y-2.5 border-t border-line pt-4 text-[15px]">
        {hold.items.map((it, i) => {
          const tyId = it.k === 'seat' || it.k === 'slot' ? it.typeId : null;
          const ty = tyId ? types.find((x) => x.id === tyId) : null;
          const qty = it.k === 'zone' || it.k === 'slot' ? it.qty : 1;
          const req = ty?.req ? tl(ty.req) : '';
          return (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0">
                {tl(it.label)}
                {ty && <b className="font-semibold"> · {tl(ty.name)}</b>}
                {qty > 1 && <span className="text-ink-3"> × {qty}</span>}
                {it.k === 'table' && <span className="text-ink-3"> · {nTickets(it.seats.length)}</span>}
                {req && (
                  <span className="mt-0.5 flex items-start gap-1 text-sm text-warn">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {req}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{sum(it.price * qty)}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-4">
        <span className="text-ink-2">
          {t3('Jami', 'Итого', 'Total')} · {nTickets(itemCount(hold.items))}
        </span>
        <b className="text-xl tabular-nums">{sum(total)}</b>
        {showUsd && <span className="w-full text-right text-sm text-ink-3">{usd(total)}</span>}
      </div>
    </div>
  );
}

export function UnitHead({ u, small }: { u: Unit; small?: boolean }) {
  useI18n();
  return (
    <div className="flex gap-3">
      <div className={cn('shrink-0 overflow-hidden rounded-xl', small ? 'h-14 w-11' : 'h-20 w-16')}>
        <Poster card={u.ev.card} showTitle={false} />
      </div>
      <div className="min-w-0">
        <div className="leading-tight font-bold">{tl(u.ev.card.title)}</div>
        <div className="mt-1 text-sm font-medium">{unitWhen(u)}</div>
        <div className="text-sm text-ink-3">
          {u.venue?.name}
          {u.hall && u.venue && u.venue.halls.length > 1 ? ` · ${u.hall.name}` : ''}
        </div>
      </div>
    </div>
  );
}

export function Steps({ steps, cur }: { steps: { k: string; label: string }[]; cur: string }) {
  useI18n();
  const ci = steps.findIndex((s) => s.k === cur);
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.k} className={cn('flex items-center gap-2 font-medium', i === ci ? 'text-ink' : i < ci ? 'text-ok' : 'text-ink-3')} aria-current={i === ci ? 'step' : undefined}>
          <span className={cn('grid size-7 place-items-center rounded-full text-sm font-bold', i === ci ? 'bg-brand text-ink' : i < ci ? 'bg-ok-soft text-ok' : 'bg-black/5')}>{i < ci ? <Check className="size-4" /> : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}
