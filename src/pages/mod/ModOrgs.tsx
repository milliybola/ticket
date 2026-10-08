/* Organizer applications (US-02): the queue (under review first, oldest on top), filters and search, the card with
   changed fields highlighted for resubmissions, approve / return with a reason. */
import { CheckCircle2, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n, LANG_LABEL } from '../../lib/i18n';
import { digits, fmtPhone } from '../../lib/format';
import { ago, fmtDT } from '../../lib/time';
import { byId } from '../../lib/util';
import { decideOrg } from '../../domain/rules';
import type { Org } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { useDb } from '../../store/db';
import { Badge, Button, Card, Empty, Input, Modal, Notice, PageHeader, Segmented, cn, toast } from '../../components/ui';
import { alreadyText, ConfirmDialog, DecisionHistory, kindsText, OrgStatusBadge, ReasonDialog } from '../../features/ops/common';

type Filter = 'review' | 'rework' | 'approved' | 'all';

export default function ModOrgs() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const [filter, setFilter] = useState<Filter>('review');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = { review: 0, rework: 0, approved: 0, all: db.orgs.length } as Record<Filter, number>;
  for (const o of db.orgs) counts[o.status]++;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const dg = digits(s);
    const rank = { review: 0, rework: 1, approved: 2 };
    return db.orgs
      .filter((o) => filter === 'all' || o.status === filter)
      .filter((o) => !s || o.name.toLowerCase().includes(s) || o.email.toLowerCase().includes(s) || (dg.length >= 3 && digits(o.phone).includes(dg)))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.submittedAt - b.submittedAt);
  }, [db, db.rev, filter, q, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = byId(db.orgs, openId);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t3('Tashkilotchilar', 'Организаторы', 'Organizers')} sub={t3('Tekshiruvdagi anketalar — eng eskisi yuqorida: navbat yoʻqolmasin.', 'Анкеты на проверке — самые старые сверху, чтобы очередь не терялась.', 'Applications under review, oldest first, so the queue never gets lost.')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'review', label: `${t3('Tekshiruvda', 'На проверке', 'Under review')} · ${counts.review}` },
            { value: 'rework', label: `${t3('Tuzatishda', 'На доработке', 'Needs changes')} · ${counts.rework}` },
            { value: 'approved', label: `${t3('Tasdiqlangan', 'Одобрены', 'Approved')} · ${counts.approved}` },
            { value: 'all', label: `${t3('Hammasi', 'Все', 'All')} · ${counts.all}` },
          ]}
        />
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t3('Nomi, telefon yoki email', 'Название, телефон или email', 'Name, phone or email')} />
        </div>
      </div>
      {list.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[760px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                {[t3('Tashkilot', 'Организация', 'Organization'), t3('Faoliyat turi', 'Вид деятельности', 'Kinds'), t3('Yuborilgan', 'Отправлена', 'Submitted'), t3('Belgi', 'Пометка', 'Mark'), t3('Holat', 'Статус', 'Status')].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-page" onClick={() => setOpenId(o.id)}>
                  <td className="px-4 py-3">
                    <b className="block">{o.name}</b>
                    <span className="text-sm text-ink-3">
                      {o.email} · {fmtPhone(o.phone)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{kindsText(o.kinds)}</td>
                  <td className="px-4 py-3 text-sm">
                    {fmtDT(o.submittedAt)}
                    <span className="block text-ink-3">{ago(o.submittedAt)}</span>
                  </td>
                  <td className="px-4 py-3">{o.resubmitted && <Badge tone="info">{t3('Qayta', 'Повторно', 'Again')}</Badge>}</td>
                  <td className="px-4 py-3">
                    <OrgStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <Empty title={filter === 'review' && !q ? t3('Navbat boʻsh', 'Очередь пуста', 'The queue is empty') : t3('Hech narsa topilmadi', 'Ничего не найдено', 'Nothing found')} />
        </Card>
      )}
      {open && <OrgCard org={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function OrgCard({ org, onClose }: { org: Org; onClose: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const modId = useAuth((s) => s.modId);
  const mod = byId(db.mods, modId);
  const [confirm, setConfirm] = useState(false);
  const [ret, setRet] = useState(false);
  const [already, setAlready] = useState('');
  const decide = (decision: 'approved' | 'rework', reason: string) => {
    const r = decideOrg(org.id, decision, reason, mod?.name || '');
    if (!r.ok) {
      setAlready(alreadyText(r.already));
      return;
    }
    toast(decision === 'approved' ? t3('Tashkilotchi tasdiqlandi, xat yuborildi', 'Организатор одобрен, письмо отправлено', 'Organizer approved; email sent') : t3('Anketa tuzatishga qaytarildi, xat yuborildi', 'Анкета возвращена на доработку, письмо отправлено', 'Application returned; email sent'), 'ok');
  };
  const prev = (org.prev || {}) as Record<string, unknown>;
  const hl = (k: string) => org.status === 'review' && org.resubmitted && (org.changed.includes(k) || k in prev);
  const old = (k: string) => {
    const v = prev[k];
    if (v == null) return '';
    if (k === 'kinds') return kindsText(v as Org['kinds']);
    if (k === 'phone') return fmtPhone(String(v));
    return String(v);
  };
  const rows: [string, string, string][] = [
    ['name', t3('Tashkilot nomi', 'Название организации', 'Organization name'), org.name],
    ['kinds', t3('Faoliyat turi', 'Вид деятельности', 'Kinds'), kindsText(org.kinds)],
    ['contact', t3('Masʼul shaxs', 'Контактное лицо', 'Contact person'), org.contact],
    ['phone', t3('Telefon', 'Телефон', 'Phone'), fmtPhone(org.phone)],
    ['email', 'Email', org.email],
    ['lang', t3('Xatlar tili', 'Язык писем', 'Email language'), LANG_LABEL[org.lang]],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {org.name} <OrgStatusBadge status={org.status} />
          {org.resubmitted && <Badge tone="info">{t3('Qayta', 'Повторно', 'Again')}</Badge>}
        </span>
      }
      footer={
        org.status === 'review' ? (
          <>
            <Button variant="outline" onClick={() => setRet(true)}>
              <RotateCcw className="size-4" />
              {t3('Tuzatishga qaytarish', 'Вернуть на доработку', 'Return for changes')}
            </Button>
            <Button variant="ok" onClick={() => setConfirm(true)}>
              <CheckCircle2 className="size-4" />
              {t3('Tasdiqlash', 'Одобрить', 'Approve')}
            </Button>
          </>
        ) : undefined
      }
    >
      {already && (
        <Notice tone="bad" className="mb-4">
          {already}
        </Notice>
      )}
      {org.resubmitted && org.status === 'review' && (
        <Notice tone="info" className="mb-4">
          {org.changed.length
            ? t3('Anketa qayta yuborildi. Oʻzgargan maydonlar sariq rangda.', 'Анкета отправлена повторно. Изменённые поля подсвечены.', 'Resubmitted. Changed fields are highlighted.')
            : t3('Anketa oʻzgarishsiz qayta yuborildi.', 'Анкета отправлена повторно без изменений.', 'Resubmitted without changes.')}
        </Notice>
      )}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
        {rows.map(([k, label, val]) => (
          <div key={k} className="contents">
            <dt className="text-sm text-ink-3 sm:pt-1">{label}</dt>
            <dd className={cn('rounded-lg px-2 py-1 font-medium', hl(k) && 'bg-brand-soft')}>
              {val}
              {hl(k) && old(k) && (
                <span className="mt-0.5 block text-sm font-normal text-ink-3">
                  {t3('Oldin:', 'Было:', 'Before:')} <s>{old(k)}</s>
                </span>
              )}
            </dd>
          </div>
        ))}
        <dt className="text-sm text-ink-3 sm:pt-1">{t3('Roʻyxatdan oʻtgan', 'Дата регистрации', 'Registered')}</dt>
        <dd className="px-2 py-1">{fmtDT(org.createdAt)}</dd>
        <dt className="text-sm text-ink-3 sm:pt-1">{t3('Yuborilgan', 'Отправлена', 'Submitted')}</dt>
        <dd className="px-2 py-1">
          {fmtDT(org.submittedAt)} <span className="text-ink-3">· {ago(org.submittedAt)}</span>
        </dd>
      </dl>
      <h3 className="mt-6 mb-3 font-bold">{t3('Qarorlar tarixi', 'История решений', 'Decision history')}</h3>
      <DecisionHistory items={org.history} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t3('Tashkilotchini tasdiqlaysizmi?', 'Одобрить организатора?', 'Approve the organizer?')} text={t3('Tashkilotchi tadbirlarni moderatsiyaga yubora oladi. Tasdiqni MVPda bekor qilib boʻlmaydi.', 'Организатор сможет отправлять мероприятия на модерацию. Одобрение в MVP отменить нельзя.', 'The organizer will be able to send events for moderation. Approval can’t be undone in the MVP.')} okLabel={t3('Tasdiqlash', 'Одобрить', 'Approve')} onOk={() => decide('approved', '')} />
      <ReasonDialog open={ret} onClose={() => setRet(false)} title={t3('Tuzatishga qaytarish', 'Вернуть на доработку', 'Return for changes')} hint={t3('Sabab tashkilotchiga uning tilida email bilan yuboriladi.', 'Причина уйдёт организатору письмом.', 'The reason goes to the organizer by email.')} okLabel={t3('Qaytarish', 'Вернуть', 'Return')} onOk={(r) => decide('rework', r)} />
    </Modal>
  );
}
