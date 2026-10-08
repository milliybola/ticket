/* Buyer details (US-31, US-36) and museum visitors with the passport check (US-32), shared by checkout and the box office. */
import { ArrowLeft, Check, FlaskConical, UserRound } from 'lucide-react';
import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { tl, useI18n } from '../../lib/i18n';
import { COUNTRIES, normPhone, splitPhone, sum, validEmail } from '../../lib/format';
import { normDoc, PASS_RE, passportCheck, passportUsed, switchSlotType, visitorSlots, type PassportStatus, type VisitorSlot } from '../../domain/purchase';
import type { Buyer, EventItem, Hold, Visitor } from '../../domain/types';
import { Button, Checkbox, cn, Field, Input, Modal, Notice, Select, Spinner } from '../ui';
import { PhoneField } from './parts';

// ---------------------------------------------------------------- buyer

export function BuyerForm({ initial, consented = false, online, title, sub, submitLabel, onSubmit, onBack, footer }: { initial: Buyer | null; consented?: boolean; online: boolean; title: string; sub?: ReactNode; submitLabel: string; onSubmit: (b: Buyer, marketing: boolean) => void; onBack?: () => void; footer?: ReactNode }) {
  const { t3 } = useI18n();
  const sp = initial?.phone ? splitPhone(initial.phone) : { iso: 'UZ', num: '' };
  const [name, setName] = useState(initial?.name || '');
  const [iso, setIso] = useState(sp.iso);
  const [num, setNum] = useState(sp.num);
  const [email, setEmail] = useState(initial?.email || '');
  const [consent, setConsent] = useState(consented);
  const [marketing, setMarketing] = useState(false);
  const [tried, setTried] = useState(false);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const phone = normPhone(iso, num);
  const errs = {
    name: name.trim().length < 2 || name.trim().length > 60 ? t3('Ismni kiriting', 'Укажите имя', 'Enter your name') : '',
    phone: !phone ? t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number') : '',
    email: email.trim() && !validEmail(email) ? t3('Emailni tekshiring', 'Проверьте email', 'Check the email') : '',
    consent: online && !consent ? t3('Davom etish uchun rozilik kerak', 'Нужно согласие, чтобы продолжить', 'Please agree to continue') : '',
  };
  const ok = !Object.values(errs).some(Boolean);
  const show = (k: keyof typeof errs) => (tried ? errs[k] : '');
  return (
    <form
      ref={form}
      noValidate
      className="space-y-4 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!ok) {
          const first = (['name', 'phone', 'email', 'consent'] as const).find((k) => errs[k]);
          form.current?.querySelector<HTMLElement>(`[data-f="${first}"] input`)?.focus();
          return;
        }
        onSubmit({ name: name.trim(), phone: phone!, email: email.trim() }, marketing);
      }}
    >
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        {sub && <p className="mt-1 text-ink-3">{sub}</p>}
      </div>
      <div data-f="name">
        <Field label={t3('Ism', 'Имя', 'Name')} required error={show('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete={online ? 'name' : 'off'} invalid={!!show('name')} autoFocus={!online && !name} />
        </Field>
      </div>
      <div data-f="phone">
        <Field label={t3('Telefon', 'Телефон', 'Phone')} required error={show('phone')} hint={t3('Xorijiy raqamlar ham mos keladi — mamlakat kodini tanlang.', 'Иностранные номера тоже подходят — выберите код страны.', 'Foreign numbers work too: pick your country code.')}>
          <PhoneField iso={iso} num={num} onIso={setIso} onNum={setNum} invalid={!!show('phone')} />
        </Field>
      </div>
      <div data-f="email">
        <Field label={<>Email <span className="font-normal text-ink-3">({t3('ixtiyoriy', 'необязательно', 'optional')})</span></>} error={show('email')} hint={online ? t3('Chiptani pochtaga yuboramiz', 'Пришлём билет на почту', 'We’ll email your tickets') : t3('Koʻrsatilsa — chipta pochtaga ham keladi', 'Если указать — билет придёт и на почту', 'If given, the ticket is emailed as well')}>
          <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={online ? 'email' : 'off'} invalid={!!show('email')} />
        </Field>
      </div>
      {online && (
        <div className="space-y-3">
          <div data-f="consent">
            <Checkbox
              checked={consent}
              onChange={setConsent}
              invalid={!!show('consent')}
              label={
                <>
                  {t3('Men ', 'Согласен с ', 'I agree to the ')}
                  <button type="button" className="underline" onClick={(e) => { e.preventDefault(); setLegal('terms'); }}>
                    {t3('xarid shartlari', 'условиями покупки', 'terms of purchase')}
                  </button>
                  {t3(' va ', ' и ', ' and the ')}
                  <button type="button" className="underline" onClick={(e) => { e.preventDefault(); setLegal('privacy'); }}>
                    {t3('shaxsiy maʼlumotlarga ishlov berishga', 'обработкой персональных данных', 'personal data policy')}
                  </button>
                  {t3(' roziman', '', '')}
                  <span className="text-bad"> *</span>
                </>
              }
            />
            {show('consent') && <p className="mt-1 ml-7 text-sm text-bad">{errs.consent}</p>}
          </div>
          <Checkbox checked={marketing} onChange={setMarketing} label={t3('Sayohat yangiliklari va takliflarini olishni xohlayman', 'Хочу получать новости и предложения Sayohat', 'Send me Sayohat news and offers')} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {onBack && (
          <Button variant="outline" size="lg" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t3('Orqaga', 'Назад', 'Back')}
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1 sm:flex-none">
          {submitLabel}
        </Button>
      </div>
      {footer}
      <LegalModal doc={legal} onClose={() => setLegal(null)} />
    </form>
  );
}

// ---------------------------------------------------------------- museum visitors

export type VRow = { typeId: string; passport: VisitorSlot['passport']; name: string; doc: string; status: PassportStatus; country: string; num: string };
const blank = (s: VisitorSlot): VRow => ({ typeId: s.typeId, passport: s.passport, name: '', doc: '', status: 'idle', country: '', num: '' });
/** Keeps entered data attached to the right ticket when the hold's types change (citizen → foreigner). */
export function alignRows(rows: VRow[], slots: VisitorSlot[]): VRow[] {
  const pool = rows.slice();
  return slots.map((s) => {
    const k = pool.findIndex((r) => r.typeId === s.typeId);
    return k >= 0 ? { ...pool.splice(k, 1)[0], passport: s.passport } : blank(s);
  });
}
export function visitorsOut(rows: VRow[]): (Visitor | null)[] {
  return rows.map((r) =>
    r.passport === 'none' ? null : r.passport === 'citizen' ? { name: r.name.trim(), doc: normDoc(r.doc), citizen: true } : { name: r.name.trim(), doc: normDoc(r.num), citizen: false, country: r.country === 'OT' ? '' : r.country },
  );
}

export function VisitorsForm({ hold, ev, buyerName, box, rows: raw, setRows, onBack, onDone }: { hold: Hold; ev: EventItem; buyerName: string; box?: boolean; rows: VRow[]; setRows: Dispatch<SetStateAction<VRow[]>>; onBack: () => void; onDone: (v: (Visitor | null)[]) => void }) {
  const { t3 } = useI18n();
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const slots = visitorSlots(hold, ev);
  const rows = alignRows(raw, slots);
  const foreign = ev.types.find((t) => t.passport === 'foreigner' && !t.hidden);
  const patch = (i: number, p: Partial<VRow>) =>
    setRows((prev) => {
      const al = alignRows(prev, slots);
      al[i] = { ...al[i], ...p };
      return al;
    });
  const precheck = (i: number, list: VRow[]): PassportStatus => {
    const d = normDoc(list[i].doc);
    if (!PASS_RE.test(d)) return 'format';
    if (list.some((x, j) => j !== i && x.passport === 'citizen' && normDoc(x.doc) === d) || passportUsed(hold.sid, d)) return 'dup';
    return passportCheck(d);
  };
  const verify = (i: number) => {
    const d = normDoc(rows[i].doc);
    if (!d) return;
    const st = precheck(i, rows);
    if (st === 'format' || st === 'dup') return patch(i, { status: st });
    patch(i, { status: 'checking' });
    // the state service answers after a moment
    setTimeout(() => {
      setRows((prev) => {
        const al = alignRows(prev, visitorSlots(hold, ev));
        const k = al.findIndex((r) => r.status === 'checking' && normDoc(r.doc) === d);
        if (k >= 0) al[k] = { ...al[k], status: precheck(k, al) };
        return al;
      });
    }, 700);
  };
  const toForeign = (i: number) => {
    if (!foreign) return;
    const from = rows[i].typeId;
    setRows(() => {
      const al = rows.slice();
      al[i] = { ...al[i], typeId: foreign.id, passport: 'foreigner', status: 'idle' };
      return al;
    });
    switchSlotType(hold.id, from, foreign.id);
  };
  const fillMe = () => {
    const i = rows.findIndex((r) => r.passport !== 'none' && !r.name.trim());
    const k = i >= 0 ? i : rows.findIndex((r) => r.passport !== 'none');
    if (k >= 0 && buyerName) patch(k, { name: buyerName });
  };
  const rowErr = (r: VRow): string => {
    if (r.passport === 'none') return '';
    if (r.name.trim().length < 2) return t3('Familiya va ismni kiriting', 'Укажите фамилию и имя', 'Enter the full name');
    if (r.passport === 'citizen' && r.status !== 'ok') return t3('Pasport tekshiruvdan oʻtishi kerak', 'Паспорт должен пройти проверку', 'The passport must be verified');
    if (r.passport === 'foreigner' && (!r.country || normDoc(r.num).length < 5)) return t3('Mamlakat va pasport raqamini kiriting', 'Укажите страну и номер паспорта', 'Enter the country and passport number');
    return '';
  };
  const submit = () => {
    setTried(true);
    // citizens typed in but not checked yet: check now
    const next = rows.map((r, i) => (r.passport === 'citizen' && (r.status === 'idle' || r.status === 'format') && r.doc ? { ...r, status: precheck(i, rows) } : r));
    setRows(next);
    const bad = next.map(rowErr).find(Boolean);
    if (bad) {
      setErr(next.some((r) => r.passport === 'citizen' && r.status !== 'ok') ? t3('Fuqaro pasporti tekshiruvdan oʻtishi kerak, aks holda xorijiy fuqarolar tarifini tanlang', 'Паспорт гражданина должен пройти проверку, иначе выберите тариф для иностранцев', 'Each citizen passport must pass verification, or switch to the foreign visitor rate') : bad);
      return;
    }
    setErr('');
    onDone(visitorsOut(next));
  };
  return (
    <div className="space-y-4 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-6">
      <div>
        <h2 className="text-xl font-bold">{t3('Tashrif buyuruvchilar maʼlumotlari', 'Данные посетителей', 'Visitor details')}</h2>
        <p className="mt-1 text-ink-3">{t3('Narx fuqarolikka bogʻliq, shuning uchun maʼlumotlar har bir tashrif buyuruvchi uchun kiritiladi. Bolalar chiptasi uchun pasport kerak emas.', 'Цена зависит от гражданства, поэтому данные вводятся на каждого посетителя. На детский билет паспорт не нужен.', 'Prices depend on citizenship, so we need details for each visitor. Child tickets need no passport.')}</p>
      </div>
      {buyerName && (
        <Button variant="soft" size="sm" onClick={fillMe}>
          <UserRound className="size-4" />
          {box ? t3('Xaridor maʼlumotlari bilan toʻldirish', 'Заполнить данными покупателя', 'Use the buyer’s details') : t3('Mening maʼlumotlarim bilan toʻldirish', 'Заполнить моими данными', 'Use my details')}
        </Button>
      )}
      <div className="space-y-3">
        {rows.map((r, i) => {
          const e = tried ? rowErr(r) : '';
          return (
            <fieldset key={i} className={cn('rounded-2xl border p-4', e ? 'border-bad' : 'border-line')}>
              <legend className="px-1 text-sm font-semibold">
                {t3('{n}-tashrif buyuruvchi', 'Посетитель {n}', 'Visitor {n}', { n: i + 1 })} · <span className="text-ink-2">{tl(slots[i].typeName)}</span>
              </legend>
              {r.passport === 'none' ? (
                <p className="text-sm text-ink-3">{t3('Pasport kerak emas.', 'Паспорт не нужен.', 'No passport needed.')}</p>
              ) : (
                <div className="space-y-3">
                  <Field label={t3('Familiya va ism', 'Фамилия и имя', 'Full name')} required>
                    <Input value={r.name} onChange={(ev2) => patch(i, { name: ev2.target.value })} autoComplete="off" maxLength={80} invalid={tried && r.name.trim().length < 2} />
                  </Field>
                  {r.passport === 'citizen' ? (
                    <Field label={t3('Pasport yoki ID-karta seriyasi va raqami', 'Серия и номер паспорта или ID-карты', 'Passport or ID card series and number')} required>
                      <div className="flex gap-2">
                        <Input
                          value={r.doc}
                          placeholder="AA1234567"
                          maxLength={11}
                          autoCapitalize="characters"
                          autoComplete="off"
                          className="font-mono uppercase"
                          invalid={['bad', 'format', 'dup', 'down'].includes(r.status)}
                          onChange={(ev2) => patch(i, { doc: ev2.target.value.toUpperCase(), status: 'idle' })}
                          onBlur={() => r.status === 'idle' && PASS_RE.test(normDoc(r.doc)) && verify(i)}
                          onKeyDown={(ev2) => {
                            if (ev2.key === 'Enter') {
                              ev2.preventDefault();
                              verify(i);
                            }
                          }}
                        />
                        <Button variant="outline" onClick={() => verify(i)} disabled={r.status === 'checking' || !r.doc}>
                          {t3('Tekshirish', 'Проверить', 'Verify')}
                        </Button>
                      </div>
                      <PassportState st={r.status} />
                      {(r.status === 'bad' || r.status === 'down') && foreign && (
                        <Button variant="soft" size="sm" className="mt-2" onClick={() => toForeign(i)}>
                          {t3('«{t}» tarifiga oʻtish — {p}', 'Сменить на «{t}» — {p}', 'Switch to "{t}" — {p}', { t: tl(foreign.name), p: sum(foreign.price || 0) })}
                        </Button>
                      )}
                    </Field>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t3('Mamlakat', 'Страна', 'Country')} required>
                        <Select value={r.country} onChange={(ev2) => patch(i, { country: ev2.target.value })} invalid={tried && !r.country}>
                          <option value="">—</option>
                          {COUNTRIES.filter((c) => c.iso !== 'UZ').map((c) => (
                            <option key={c.iso} value={c.iso}>
                              {tl(c.name)}
                            </option>
                          ))}
                          <option value="OT">{t3('Boshqa mamlakat', 'Другая страна', 'Other country')}</option>
                        </Select>
                      </Field>
                      <Field label={t3('Pasport raqami', 'Номер паспорта', 'Passport number')} required hint={t3('Tekshirilmaydi', 'Без проверки', 'Not verified online')}>
                        <Input value={r.num} onChange={(ev2) => patch(i, { num: ev2.target.value.toUpperCase() })} maxLength={20} autoCapitalize="characters" autoComplete="off" className="font-mono uppercase" invalid={tried && normDoc(r.num).length < 5} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
              {e && <p className="mt-2 text-sm text-bad">{e}</p>}
            </fieldset>
          );
        })}
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t3('Orqaga', 'Назад', 'Back')}
        </Button>
        <Button size="lg" className="flex-1 sm:flex-none" onClick={submit}>
          {box ? t3('Toʻlovga', 'К оплате', 'To payment') : t3('Toʻlovga oʻtish', 'Перейти к оплате', 'Go to payment')}
        </Button>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-ink-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0" />
        {t3(
          'Demo: AA1234567 koʻrinishidagi raqam tekshiruvdan oʻtadi, 0 bilan tugaydigani — «topilmadi». Xizmatni demo vositalarda oʻchirish mumkin.',
          'Демо: номер вида AA1234567 проходит проверку, номер на 0 — «не найден». Сервис можно отключить в демо-инструментах.',
          'Demo: a number like AA1234567 passes, one ending in 0 is "not found". You can switch the service off in Demo tools.',
        )}
      </p>
    </div>
  );
}

function PassportState({ st }: { st: PassportStatus }) {
  const { t3 } = useI18n();
  if (st === 'checking')
    return (
      <span className="mt-1.5 flex items-center gap-2 text-sm text-ink-3">
        <Spinner className="size-4" />
        {t3('Davlat xizmatida tekshirilmoqda…', 'Проверяем в госсервисе…', 'Checking with the state service…')}
      </span>
    );
  if (st === 'ok')
    return (
      <span className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-ok">
        <Check className="size-4" />
        {t3('Tekshirildi', 'Проверено', 'Verified')}
      </span>
    );
  const msg =
    st === 'bad'
      ? t3('Pasport topilmadi. Maʼlumotlarni tekshiring yoki xorijiy fuqarolar tarifini tanlang.', 'Паспорт не найден. Проверьте данные или выберите тариф для иностранцев.', 'Passport not found. Check the details or choose the foreign visitor rate.')
      : st === 'down'
        ? t3('Tekshiruv vaqtincha ishlamayapti, bir necha daqiqadan soʻng urinib koʻring. Hozir fuqarolar narxida xarid qilib boʻlmaydi.', 'Проверка временно недоступна, попробуйте через несколько минут. Купить по цене для граждан сейчас нельзя.', 'Verification is temporarily unavailable; try again in a few minutes. The citizen rate can’t be bought right now.')
        : st === 'dup'
          ? t3('Bu pasport ushbu slot uchun allaqachon ishlatilgan', 'Этот паспорт уже использован на этот слот', 'This passport is already used for this slot')
          : st === 'format'
            ? t3('Format: ikkita lotin harfi va yettita raqam (AA1234567)', 'Формат: две латинские буквы и семь цифр (AA1234567)', 'Format: two Latin letters and seven digits (AA1234567)')
            : '';
  return msg ? <span className="mt-1.5 block text-sm text-bad">{msg}</span> : null;
}

/** Terms of purchase and the personal data policy, as the PRD requires them (final text approved by a lawyer). */
export function LegalModal({ doc, onClose }: { doc: 'terms' | 'privacy' | null; onClose: () => void }) {
  const { t3 } = useI18n();
  const terms = [
    t3('Pulni Sayohat tashkilotchi agenti sifatida qabul qiladi.', 'Деньги принимает Sayohat как агент организатора.', 'Sayohat accepts payment as the organizer’s agent.'),
    t3('Toʻlov har doim soʻmda; xorijiy karta bilan toʻlaganda kursni bank belgilaydi.', 'Оплата всегда в сумах; при оплате иностранной картой курс определяет банк.', 'Payment is always in UZS; for foreign cards your bank sets the exchange rate.'),
    t3('Joylar maʼlumot kiritishga oʻtilgandan boshlab 10 daqiqa ushlab turiladi.', 'Места держатся 10 минут с перехода к вводу данных.', 'Seats are held for 10 minutes from the moment you move on to your details.'),
    t3('Hozircha qaytarish yoʻq; konsert koʻchirilganda chipta amal qilishda davom etadi.', 'Возвратов пока нет; при переносе концерта билет остаётся действительным.', 'Refunds are not available yet; if a concert is moved, your ticket stays valid.'),
    t3('Imtiyozlarni kirishda xodim tekshiradi; tasdiqlanmasa kirishga ruxsat berilmasligi mumkin.', 'Льготы проверяет сотрудник на входе; без подтверждения льготы в проходе могут отказать.', 'Concessions are checked at the entrance; without proof, entry may be refused.'),
  ];
  const privacy = [
    t3('Telefon va ism chipta va ushbu tadbir haqidagi bildirishnomalar uchun kerak.', 'Телефон и имя нужны для билета и уведомлений об этом мероприятии.', 'Your phone and name are used for the ticket and notices about this event.'),
    t3('Muzeylarda pasport maʼlumotlari kerak, chunki narx fuqarolikka bogʻliq; fuqarolar pasporti davlat xizmati orqali tekshiriladi.', 'Паспортные данные в музеях нужны, потому что цена зависит от гражданства; паспорт граждан проверяется через госсервис.', 'Museums need passport details because prices depend on citizenship; citizens’ passports are checked with a government service.'),
    t3('Maʼlumotlar Oʻzbekistonda saqlanadi va faqat xaridorga, tadbir tashkilotchisiga va Sayohat jamoasiga koʻrinadi.', 'Данные хранятся в Узбекистане и видны только покупателю, организатору мероприятия и команде Sayohat.', 'Data is stored in Uzbekistan and is visible only to you, the event organizer and the Sayohat team.'),
    t3('Reklama xabarlari — faqat alohida rozilik bilan.', 'Рассылка — только с отдельного согласия.', 'Marketing messages only with separate consent.'),
  ];
  return (
    <Modal open={!!doc} onClose={onClose} title={doc === 'terms' ? t3('Xarid shartlari', 'Условия покупки', 'Terms of purchase') : t3('Shaxsiy maʼlumotlarga ishlov berish', 'Обработка персональных данных', 'Personal data policy')} footer={<Button onClick={onClose}>{t3('Tushunarli', 'Понятно', 'OK')}</Button>}>
      <ul className="list-disc space-y-2 pl-5 text-ink-2">
        {(doc === 'terms' ? terms : privacy).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </Modal>
  );
}
