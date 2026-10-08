/* Phone with a country code, confirmed by an SMS code (US-01, US-03). There is no SMS gateway in this build: the code
   lands in the outbox and a demo hint shows it on screen. Resend after 60 s; 5 wrong codes lock input for 10 minutes. */
import { CheckCircle2, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { inLang, t3, tl, useI18n, type Lang } from '../../lib/i18n';
import { COUNTRIES, normPhone } from '../../lib/format';
import { MIN, mmss, now } from '../../lib/time';
import { randInt } from '../../lib/util';
import { send } from '../../domain/rules';
import { tx } from '../../store/db';
import { Button, Input, Select, cn } from '../../components/ui';
import { useTicker } from './common';

export const CODE_WAIT = 60_000;
export const CODE_LOCK = 10 * MIN;
export const CODE_TRIES = 5;

type CodeState = { code: string; phone: string; sentAt: number; attempts: number; lockUntil: number; input: string; err: string };

export function PhoneConfirm({
  iso,
  num,
  onChange,
  verified,
  onVerified,
  lang,
  invalid,
  disabled,
}: {
  iso: string;
  num: string;
  onChange: (iso: string, num: string) => void;
  /** The E.164 number already confirmed (or null). */
  verified: string | null;
  onVerified: (e164: string) => void;
  /** Language of the SMS. */
  lang: Lang;
  invalid?: boolean;
  disabled?: boolean;
}) {
  useI18n();
  const [st, setSt] = useState<CodeState | null>(null);
  const phone = normPhone(iso, num);
  const isVerified = !!phone && phone === verified;
  const locked = !!st && st.lockUntil > now();
  const waitLeft = st ? st.sentAt + CODE_WAIT - now() : 0;
  useTicker(1000, !!st && (locked || waitLeft > 0));
  const [numErr, setNumErr] = useState('');

  const sendCode = () => {
    if (!phone) {
      setNumErr(t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number'));
      return;
    }
    if (locked || (st && st.phone === phone && waitLeft > 0)) return;
    const code = String(randInt(100000, 999999));
    tx(() => send('sms', phone, '', inLang(lang, `Sayohat: tasdiqlash kodi ${code}`, `Sayohat: код подтверждения ${code}`, `Sayohat: your confirmation code is ${code}`), lang, 'code'));
    setNumErr('');
    setSt({ code, phone, sentAt: now(), attempts: st?.phone === phone ? st.attempts : 0, lockUntil: st?.lockUntil || 0, input: '', err: '' });
  };
  const check = () => {
    if (!st || locked) return;
    if (phone !== st.phone) {
      setSt({ ...st, err: t3('Raqam oʻzgardi — yangi kod soʻrang', 'Номер изменился — запросите новый код', 'The number changed: request a new code') });
      return;
    }
    if (st.input.trim() === st.code) {
      setSt({ ...st, attempts: 0, err: '', input: '' });
      onVerified(phone);
      return;
    }
    const attempts = st.attempts + 1;
    if (attempts >= CODE_TRIES) setSt({ ...st, attempts: 0, lockUntil: now() + CODE_LOCK, input: '', err: '' });
    else setSt({ ...st, attempts, input: '', err: t3('Notoʻgʻri kod. Qolgan urinishlar: {n}', 'Неверный код. Осталось попыток: {n}', 'Wrong code. Attempts left: {n}', { n: CODE_TRIES - attempts }) });
  };

  const codeSentHere = st && st.phone === phone;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={iso} onChange={(e) => onChange(e.target.value, num)} className="w-32 shrink-0" disabled={disabled} aria-label={t3('Mamlakat kodi', 'Код страны', 'Country code')}>
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.iso} +{c.code}
            </option>
          ))}
        </Select>
        <Input
          value={num}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={iso === 'UZ' ? '90 123 45 67' : ''}
          onChange={(e) => {
            setNumErr('');
            onChange(iso, e.target.value);
          }}
          invalid={invalid || !!numErr}
          disabled={disabled}
          aria-label={t3('Telefon raqami', 'Номер телефона', 'Phone number')}
        />
      </div>
      {numErr && <div className="text-sm text-bad">{numErr}</div>}
      {disabled ? null : isVerified ? (
        <div className="flex items-center gap-1.5 text-sm font-medium text-ok">
          <CheckCircle2 className="size-4" />
          {t3('Telefon tasdiqlangan', 'Телефон подтверждён', 'Phone confirmed')}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-page p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="dark" onClick={sendCode} disabled={locked || (!!codeSentHere && waitLeft > 0)}>
              {codeSentHere ? t3('Kodni qayta yuborish', 'Отправить код ещё раз', 'Resend the code') : t3('SMS-kod yuborish', 'Отправить SMS-код', 'Send SMS code')}
            </Button>
            {codeSentHere && waitLeft > 0 && !locked && (
              <span className="text-sm text-ink-3">
                {t3('Qayta yuborish', 'Повторно через', 'Resend in')} <b className="tabular-nums">{mmss(waitLeft)}</b>
              </span>
            )}
          </div>
          {codeSentHere && !locked && (
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <Input
                className="w-40 font-mono tracking-widest"
                value={st!.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                onChange={(e) => setSt({ ...st!, input: e.target.value.replace(/\D/g, ''), err: '' })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    check();
                  }
                }}
                invalid={!!st!.err}
                aria-label={t3('SMS-kod', 'Код из SMS', 'SMS code')}
              />
              <Button variant="outline" onClick={check} disabled={st!.input.length < 4}>
                {t3('Tasdiqlash', 'Подтвердить', 'Confirm')}
              </Button>
            </div>
          )}
          {codeSentHere && st!.err && <div className="mt-1 text-sm text-bad">{st!.err}</div>}
          {locked && (
            <div className="mt-2 text-sm text-bad">
              {t3('Juda koʻp notoʻgʻri urinish. Kod kiritish bloklandi, qolgan vaqt:', 'Слишком много неверных попыток. Ввод кода заблокирован, осталось:', 'Too many wrong attempts. Code entry is locked for another')} <b className="tabular-nums">{mmss(st!.lockUntil - now())}</b>
            </div>
          )}
          {codeSentHere && !locked && (
            <div className={cn('mt-3 flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info')}>
              <FlaskConical className="mt-0.5 size-4 shrink-0" />
              <span>
                {t3('Demo: SMS-shlyuz ulanmagan. Kod: ', 'Демо: SMS-шлюз не подключён. Код: ', 'Demo: no SMS gateway is connected. The code is ')}
                <b className="font-mono">{st!.code}</b>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const countryLabel = (iso: string) => tl(COUNTRIES.find((c) => c.iso === iso)?.name);
