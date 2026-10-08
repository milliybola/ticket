/* Shared pieces of the organizer sign-in/application screens, the entry check, reports and the moderator workspace. */
import { clsx } from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LANG_SHORT, LANGS, t3, tl, tx3, useI18n, type L10n } from '../../lib/i18n';
import { fmtDT, now } from '../../lib/time';
import { ORG_STATUS, kindName } from '../../domain/rules';
import type { Decision, EventKind, Org } from '../../domain/types';
import { Logo } from '../../components/common';
import { Badge, Button, Field, Modal, Textarea } from '../../components/ui';

/** Re-renders every `ms` (countdowns, "time ago", clocks). */
export function useTicker(ms = 1000, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
}

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={clsx('flex gap-1 text-sm font-semibold', className)}>
      {LANGS.map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} className={clsx('rounded-md px-2 py-1', l === lang ? 'bg-black/5 text-ink' : 'text-ink-3 hover:text-ink')}>
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  );
}

/** Page frame for the sign-in and sign-up screens (they live outside the cabinet layout). */
export function AuthShell({ title, sub, children, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  useI18n();
  return (
    <div className="min-h-screen bg-page">
      <header className="flex h-16 items-center justify-between border-b border-line bg-white px-4 md:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <Link to="/" className="hidden text-sm text-ink-3 hover:text-ink sm:block">
            {t3('Afishaga qaytish', 'На афишу', 'Back to the storefront')}
          </Link>
          <LangSwitch />
        </div>
      </header>
      <main className={clsx('mx-auto px-4 py-8 md:py-12', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {sub && <div className="mt-2 text-ink-3">{sub}</div>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

export const ORG_KINDS: EventKind[] = ['concert', 'theatre', 'cinema', 'museum', 'sport', 'event'];
export const kindsText = (kinds: EventKind[]) => kinds.map(kindName).join(', ');

export function OrgStatusBadge({ status }: { status: Org['status'] }) {
  useI18n();
  return <Badge tone={status === 'approved' ? 'ok' : status === 'rework' ? 'bad' : 'warn'}>{tl(ORG_STATUS[status])}</Badge>;
}

const DECISION: Record<Decision['decision'], L10n> = {
  submitted: tx3('Yuborildi', 'Отправлено', 'Submitted'),
  resubmitted: tx3('Qayta yuborildi', 'Отправлено повторно', 'Resubmitted'),
  approved: tx3('Tasdiqlandi', 'Одобрено', 'Approved'),
  rework: tx3('Tuzatishga qaytarildi', 'Возвращено на доработку', 'Returned for changes'),
  withdrawn: tx3('Qaytarib olindi', 'Отозвано', 'Withdrawn'),
};
export const decisionName = (d: Decision['decision']) => tl(DECISION[d]);

/** Decision history: who, when, which decision and why. */
export function DecisionHistory({ items, empty }: { items: (Decision & { extra?: ReactNode })[]; empty?: ReactNode }) {
  useI18n();
  if (!items.length) return <p className="text-ink-3">{empty || t3('Hali qaror yoʻq', 'Решений пока нет', 'No decisions yet')}</p>;
  return (
    <ol className="space-y-3">
      {items
        .slice()
        .reverse()
        .map((h, i) => (
          <li key={i} className="flex gap-3">
            <span className={clsx('mt-1.5 size-2.5 shrink-0 rounded-full', h.decision === 'approved' ? 'bg-ok' : h.decision === 'rework' ? 'bg-bad' : 'bg-line-2')} />
            <div className="min-w-0">
              <div className="font-medium">
                {decisionName(h.decision)}
                {h.by && <span className="font-normal text-ink-3"> · {h.by}</span>}
              </div>
              <div className="text-sm text-ink-3">{fmtDT(h.at)}</div>
              {h.extra}
              {h.reason && <div className="mt-1 rounded-xl bg-bad-soft px-3 py-2 text-sm text-ink-2">{h.reason}</div>}
            </div>
          </li>
        ))}
    </ol>
  );
}

/** "Approve …?" confirmation. */
export function ConfirmDialog({ open, onClose, title, text, okLabel, onOk, tone = 'ok' }: { open: boolean; onClose: () => void; title: ReactNode; text?: ReactNode; okLabel: ReactNode; onOk: () => void; tone?: 'ok' | 'danger' | 'primary' }) {
  useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button
            variant={tone}
            onClick={() => {
              onOk();
              onClose();
            }}
          >
            {okLabel}
          </Button>
        </>
      }
    >
      {text && <p className="text-ink-2">{text}</p>}
    </Modal>
  );
}

export const REASON_MIN = 10;
export const REASON_MAX = 1000;
/** Reason dialog for "return for changes" / "decline": 10 to 1000 characters. */
export function ReasonDialog({ open, onClose, title, hint, okLabel, onOk }: { open: boolean; onClose: () => void; title: ReactNode; hint?: ReactNode; okLabel: ReactNode; onOk: (reason: string) => void }) {
  useI18n();
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) {
      setText('');
      setTried(false);
    }
  }, [open]);
  const len = text.trim().length;
  const err = len < REASON_MIN ? t3('Sababni yozing: kamida {n} ta belgi', 'Укажите причину: не меньше {n} символов', 'Write the reason: at least {n} characters', { n: REASON_MIN }) : len > REASON_MAX ? t3('Koʻpi bilan {n} ta belgi', 'Не больше {n} символов', 'At most {n} characters', { n: REASON_MAX }) : '';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setTried(true);
              if (err) return;
              onOk(text.trim());
              onClose();
            }}
          >
            {okLabel}
          </Button>
        </>
      }
    >
      {hint && <p className="mb-3 text-sm text-ink-3">{hint}</p>}
      <Field label={t3('Sabab', 'Причина', 'Reason')} required error={tried && err} hint={`${len} / ${REASON_MAX}`}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={REASON_MAX + 50} invalid={tried && !!err} autoFocus rows={5} />
      </Field>
    </Modal>
  );
}

/** "Decision already taken: <decision>, <moderator>" for the second moderator (US-02 rule 2, US-22 rule 1). */
export const alreadyText = (d: Decision | undefined) =>
  t3('Qaror allaqachon qabul qilingan: {d}, {m}', 'Решение уже принято: {d}, {m}', 'The decision is already taken: {d}, {m}', { d: d ? decisionName(d.decision).toLowerCase() : '—', m: d?.by || '—' });

/** Short countdown text "mm:ss" until a moment in demo time. */
export const leftMs = (until: number) => Math.max(0, until - now());
