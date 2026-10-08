/* The organizer's application (US-03): read-only while under review, editable after a return, resubmitted as is or
   with changes (a new phone needs an SMS code). Password and language live in a separate small form. */
import { History, Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { LANG_LABEL, LANGS, useI18n, type Lang } from '../../lib/i18n';
import { fmtPhone, normPhone, splitPhone, validEmail } from '../../lib/format';
import { fmtDT } from '../../lib/time';
import { byId } from '../../lib/util';
import { logAct, resubmitOrg } from '../../domain/rules';
import type { EventKind, Org } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { tx, useDb } from '../../store/db';
import { Button, Card, Field, Input, Modal, Notice, PageHeader, Select, toast } from '../../components/ui';
import { DecisionHistory, kindsText, OrgStatusBadge } from '../../features/ops/common';
import { KindPicker } from '../../features/ops/KindPicker';
import { PhoneConfirm } from '../../features/ops/phone';

type Vals = { name: string; kinds: EventKind[]; contact: string; iso: string; num: string; email: string };
const valsOf = (o: Org): Vals => {
  const p = splitPhone(o.phone);
  return { name: o.name, kinds: [...o.kinds], contact: o.contact, iso: p.iso, num: p.num, email: o.email };
};

export default function OrgApplication() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const org = byId(db.orgs, orgId)!;
  const [v, setV] = useState<Vals>(() => valsOf(org));
  const [verified, setVerified] = useState<string | null>(org.phone);
  const [tried, setTried] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const status = org.status;
  // a decision arrived (another tab): start from the stored application again
  useEffect(() => {
    setV(valsOf(org));
    setVerified(org.phone);
    setTried(false);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = status === 'rework';
  const reworks = org.history.filter((h) => h.decision === 'rework');
  const last = reworks[reworks.length - 1];
  const phone = normPhone(v.iso, v.num);
  const email = v.email.trim().toLowerCase();
  const errs: Partial<Record<keyof Vals | 'phone', string>> = {};
  if (v.name.trim().length < 2 || v.name.trim().length > 100) errs.name = t3('Tashkilot nomini kiriting (2–100 belgi)', 'Укажите название организации (2–100 символов)', 'Enter the organization name (2–100 characters)');
  if (!v.kinds.length) errs.kinds = t3('Kamida bitta turni tanlang', 'Выберите хотя бы один вид', 'Pick at least one kind');
  if (v.contact.trim().length < 2 || v.contact.trim().length > 60) errs.contact = t3('Masʼul shaxs ismini kiriting', 'Укажите имя контактного лица', 'Enter the contact person’s name');
  if (!phone) errs.phone = t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number');
  else if (phone !== org.phone && phone !== verified) errs.phone = t3('Yangi raqamni tasdiqlang', 'Подтвердите новый номер', 'Confirm the new number');
  else if (db.orgs.some((o) => o.id !== org.id && o.phone === phone)) errs.phone = t3('Bu telefon boshqa tashkilotchiga tegishli', 'Этот телефон принадлежит другому организатору', 'This phone belongs to another organizer');
  if (!validEmail(email)) errs.email = t3('Emailni tekshiring', 'Проверьте email', 'Check the email');
  else if (db.orgs.some((o) => o.id !== org.id && o.email.toLowerCase() === email)) errs.email = t3('Bu email boshqa tashkilotchiga tegishli', 'Этот email принадлежит другому организатору', 'This email belongs to another organizer');
  const show = (k: keyof typeof errs) => (tried ? errs[k] : undefined);
  const set = <K extends keyof Vals>(k: K, val: Vals[K]) => setV((s) => ({ ...s, [k]: val }));
  const changed = (k: keyof Org) => (org.prev && k in org.prev) || org.changed.includes(k);

  const resubmit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errs).length || !phone) return;
    resubmitOrg(org.id, { name: v.name.trim(), kinds: v.kinds, contact: v.contact.trim(), phone, email });
    toast(t3('Anketa qayta yuborildi. Moderator tekshiradi.', 'Анкета отправлена повторно. Её проверит модератор.', 'Application resubmitted. A moderator will check it.'), 'ok');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t3('Tashkilotchi anketasi', 'Анкета организатора', 'Organizer application')} sub={<span className="inline-flex items-center gap-2">{t3('Holat:', 'Статус:', 'Status:')} <OrgStatusBadge status={status} /></span>} />

      {editable && last && (
        <Notice
          tone="bad"
          className="mb-5"
          title={t3('Moderator anketani qaytardi', 'Модератор вернул анкету', 'The moderator returned your application')}
          action={
            <Button size="sm" variant="outline" onClick={() => setHistOpen(true)}>
              <History className="size-4" />
              {t3('Tarix', 'История', 'History')}
            </Button>
          }
        >
          <p className="font-medium text-ink">{last.reason}</p>
          <p className="mt-1 text-sm">
            {last.by} · {fmtDT(last.at)}
          </p>
        </Notice>
      )}
      {status === 'review' && (
        <Notice tone="warn" className="mb-5" title={t3('Anketa tekshiruvda', 'Анкета на проверке', 'The application is under review')}>
          {t3('Moderator qaror qabul qilmaguncha anketani oʻzgartirib boʻlmaydi.', 'Пока модератор не принял решение, анкету менять нельзя.', 'You can’t change the application until the moderator decides.')}
        </Notice>
      )}

      <Card>
        {editable ? (
          <form onSubmit={resubmit} noValidate className="space-y-5">
            <Field label={t3('Tashkilot nomi', 'Название организации', 'Organization name')} required error={show('name')}>
              <Input value={v.name} maxLength={100} onChange={(e) => set('name', e.target.value)} invalid={!!show('name')} />
            </Field>
            <div>
              <div className="mb-1.5 text-sm font-medium text-ink-2">
                {t3('Faoliyat turi', 'Вид деятельности', 'What you run')}
                <span className="text-bad"> *</span>
              </div>
              <KindPicker value={v.kinds} onChange={(k) => set('kinds', k)} invalid={!!show('kinds')} />
              {show('kinds') && <div className="mt-1 text-sm text-bad">{show('kinds')}</div>}
            </div>
            <Field label={t3('Masʼul shaxs ismi', 'Имя контактного лица', 'Contact person')} required error={show('contact')}>
              <Input value={v.contact} maxLength={60} onChange={(e) => set('contact', e.target.value)} invalid={!!show('contact')} />
            </Field>
            <div>
              <div className="mb-1.5 text-sm font-medium text-ink-2">
                {t3('Telefon', 'Телефон', 'Phone')}
                <span className="text-bad"> *</span>
              </div>
              <PhoneConfirm iso={v.iso} num={v.num} onChange={(iso, num) => setV((s) => ({ ...s, iso, num }))} verified={phone === org.phone ? org.phone : verified} onVerified={setVerified} lang={org.lang} invalid={!!show('phone')} />
              {show('phone') && <div className="mt-1 text-sm text-bad">{show('phone')}</div>}
            </div>
            <Field label="Email" required error={show('email')}>
              <Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} invalid={!!show('email')} />
            </Field>
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <Button type="submit" size="lg">
                {t3('Qayta yuborish', 'Отправить повторно', 'Resubmit')}
              </Button>
              <span className="text-sm text-ink-3">{t3('Hech narsani oʻzgartirmagan boʻlsangiz ham yuborish mumkin.', 'Можно отправить, даже если ничего не менялось.', 'You can resubmit even without changes.')}</span>
            </div>
          </form>
        ) : (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[200px_1fr]">
            <Row label={t3('Tashkilot nomi', 'Название организации', 'Organization name')} value={org.name} hl={changed('name') && status === 'review'} />
            <Row label={t3('Faoliyat turi', 'Вид деятельности', 'What you run')} value={kindsText(org.kinds)} hl={changed('kinds') && status === 'review'} />
            <Row label={t3('Masʼul shaxs', 'Контактное лицо', 'Contact person')} value={org.contact} hl={changed('contact') && status === 'review'} />
            <Row label={t3('Telefon', 'Телефон', 'Phone')} value={fmtPhone(org.phone)} hl={changed('phone') && status === 'review'} />
            <Row label="Email" value={org.email} hl={changed('email') && status === 'review'} />
            <Row label={t3('Roʻyxatdan oʻtgan', 'Дата регистрации', 'Registered')} value={fmtDT(org.createdAt)} />
            <Row label={t3('Yuborilgan', 'Отправлена', 'Submitted')} value={fmtDT(org.submittedAt)} />
          </dl>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-bold">{t3('Qarorlar tarixi', 'История решений', 'Decision history')}</h2>
        <DecisionHistory items={org.history} />
      </Card>

      <AccountSettings org={org} key={org.id + lang} />

      <Modal open={histOpen} onClose={() => setHistOpen(false)} title={t3('Qaytarish sabablari', 'Причины возврата', 'Reasons for returns')}>
        <ol className="space-y-3">
          {reworks
            .slice()
            .reverse()
            .map((h, i) => (
              <li key={i} className="rounded-xl bg-page p-3">
                <div className="text-sm text-ink-3">
                  {fmtDT(h.at)} · {h.by}
                </div>
                <div className="mt-1">{h.reason}</div>
              </li>
            ))}
        </ol>
      </Modal>
    </div>
  );
}

function Row({ label, value, hl }: { label: string; value: string; hl?: boolean }) {
  return (
    <>
      <dt className="text-sm text-ink-3 sm:pt-0.5">{label}</dt>
      <dd className={hl ? 'rounded-lg bg-brand-soft px-2 font-medium' : 'font-medium'}>{value}</dd>
    </>
  );
}

/** Password change and the language of emails. */
function AccountSettings({ org }: { org: Org }) {
  const { t3 } = useI18n();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<{ cur?: string; pw?: string; pw2?: string }>({});
  const changePw = (e: FormEvent) => {
    e.preventDefault();
    const er: typeof err = {};
    if (cur !== org.password) er.cur = t3('Joriy parol notoʻgʻri', 'Текущий пароль неверный', 'The current password is wrong');
    if (pw.length < 8) er.pw = t3('Parol juda qisqa (kamida 8 belgi)', 'Пароль слишком короткий (минимум 8 символов)', 'The password is too short (at least 8 characters)');
    else if (pw2 !== pw) er.pw2 = t3('Parollar mos emas', 'Пароли не совпадают', 'The passwords don’t match');
    setErr(er);
    if (Object.keys(er).length) return;
    tx((d) => {
      const o = byId(d.orgs, org.id);
      if (o) o.password = pw;
      logAct('password-change', org.name);
    });
    setCur('');
    setPw('');
    setPw2('');
    toast(t3('Parol oʻzgartirildi', 'Пароль изменён', 'Password changed'), 'ok');
  };
  const setLang = (l: Lang) => {
    tx((d) => {
      const o = byId(d.orgs, org.id);
      if (o) o.lang = l;
    });
    toast(t3('Saqlandi', 'Сохранено', 'Saved'), 'ok');
  };
  return (
    <Card className="mt-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Lock className="size-5" />
        {t3('Kirish va til', 'Вход и язык', 'Sign-in and language')}
      </h2>
      <Field label={t3('Xatlar tili', 'Язык писем', 'Language of emails')} className="mb-5 max-w-xs">
        <Select value={org.lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_LABEL[l]}
            </option>
          ))}
        </Select>
      </Field>
      <form onSubmit={changePw} noValidate className="grid gap-4 sm:grid-cols-3">
        <Field label={t3('Joriy parol', 'Текущий пароль', 'Current password')} error={err.cur}>
          <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} invalid={!!err.cur} />
        </Field>
        <Field label={t3('Yangi parol', 'Новый пароль', 'New password')} error={err.pw}>
          <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} invalid={!!err.pw} />
        </Field>
        <Field label={t3('Yangi parolni takrorlang', 'Повторите новый пароль', 'Repeat the new password')} error={err.pw2}>
          <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={!!err.pw2} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="dark">
            {t3('Parolni oʻzgartirish', 'Сменить пароль', 'Change the password')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
