/* Small building blocks shared by the event editor steps. */
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { LANGS, LANG_SHORT, t3, useI18n, type L10n } from '../../lib/i18n';
import { nfmt } from '../../lib/format';
import { fmtDT } from '../../lib/time';
import { sessionSold, unitInfo, unitStock } from '../../domain/rules';
import type { EventItem, Session } from '../../domain/types';
import { Button, cn, Input, Modal, Textarea, toast } from '../../components/ui';
import { delHint, delState, deleteSession } from './helpers';

// ---------------------------------------------------------------- confirm dialog (promise based)

type ConfirmOpts = { title: ReactNode; text?: ReactNode; extra?: ReactNode; ok?: string; danger?: boolean; cancel?: string | false };
type ConfirmState = { cur: (ConfirmOpts & { resolve: (v: boolean) => void }) | null; open: (o: ConfirmOpts) => Promise<boolean>; close: (v: boolean) => void };
const useConfirmStore = create<ConfirmState>((set, get) => ({
  cur: null,
  open: (o) =>
    new Promise<boolean>((resolve) => {
      get().cur?.resolve(false);
      set({ cur: { ...o, resolve } });
    }),
  close: (v) => {
    const c = get().cur;
    set({ cur: null });
    c?.resolve(v);
  },
}));
export const confirmBox = (o: ConfirmOpts) => useConfirmStore.getState().open(o);
/** Shows a message with one button. */
export const infoBox = (title: ReactNode, text: ReactNode) => confirmBox({ title, text, ok: t3('Tayyor', 'Готово', 'Done'), cancel: false });
export function ConfirmHost() {
  useI18n();
  const cur = useConfirmStore((s) => s.cur);
  const close = useConfirmStore((s) => s.close);
  return (
    <Modal
      open={!!cur}
      onClose={() => close(false)}
      size="sm"
      title={cur?.title}
      footer={
        <>
          {cur?.cancel !== false && (
            <Button variant="ghost" onClick={() => close(false)}>
              {cur?.cancel || t3('Bekor qilish', 'Отмена', 'Cancel')}
            </Button>
          )}
          <Button variant={cur?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {cur?.ok || t3('Tasdiqlash', 'Подтвердить', 'Confirm')}
          </Button>
        </>
      }
    >
      {cur?.text && <div className="text-[15px] text-ink-2">{cur.text}</div>}
      {cur?.extra && <div className="mt-3">{cur.extra}</div>}
    </Modal>
  );
}
/** US-24: on a published event every change is confirmed first; it goes live at once. */
export function pubConfirm(ev: EventItem): Promise<boolean> {
  if (ev.status !== 'published') return Promise.resolve(true);
  return confirmBox({
    title: t3('Oʻzgarishlar saqlansinmi?', 'Сохранить изменения?', 'Save the changes?'),
    text: t3(
      'Oʻzgarishlar darhol vitrinada va kassada paydo boʻladi. Sotilgan chiptalar va bronlar oʻzgarmaydi.',
      'Изменения сразу появятся на витрине и в кассе. Проданные билеты и брони не изменятся.',
      'The changes go live on the storefront and at the box office at once. Sold tickets and holds don’t change.',
    ),
    ok: t3('Saqlash', 'Сохранить', 'Save'),
  });
}

// ---------------------------------------------------------------- fields

/** One text in three languages: uz, ru, en inputs side by side. */
export function L3Input({ value, onChange, area, max, invalid, placeholder, rows = 3 }: { value: L10n | null | undefined; onChange: (v: L10n) => void; area?: boolean; max?: number; invalid?: boolean; placeholder?: string; rows?: number }) {
  useI18n();
  const v = value || { uz: '', ru: '', en: '' };
  return (
    <div className={cn('grid gap-2', area ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3')}>
      {LANGS.map((l) => (
        <div key={l} className="relative">
          <span className="pointer-events-none absolute top-2 left-3 z-10 text-[11px] font-bold text-ink-3">{LANG_SHORT[l]}</span>
          {area ? (
            <Textarea className="pt-6" rows={rows} maxLength={max} invalid={invalid} placeholder={placeholder} value={v[l]} onChange={(e) => onChange({ ...v, [l]: e.target.value })} />
          ) : (
            <Input className="h-14 pt-4" maxLength={max} invalid={invalid} placeholder={placeholder} value={v[l]} onChange={(e) => onChange({ ...v, [l]: e.target.value })} />
          )}
        </div>
      ))}
    </div>
  );
}
/** Price input in soʻm, kept as text so a half-typed number isn't lost. */
export function PriceInput({ value, onChange, invalid, className, placeholder }: { value: string; onChange: (v: string) => void; invalid?: boolean; className?: string; placeholder?: string }) {
  const { t3 } = useI18n();
  return (
    <div className={cn('relative', className)}>
      <Input inputMode="numeric" className="pr-14 text-right tabular-nums" invalid={invalid} placeholder={placeholder || '0'} value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ''))} />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">{t3('soʻm', 'сум', 'UZS')}</span>
    </div>
  );
}
export const priceStr = (n: number | null | undefined) => (n && n > 0 ? nfmt(n) : '');
/** Parses a price input: null when empty, NaN when invalid. */
export function parsePrice(s: string): number | null {
  const raw = s.replace(/\s/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : NaN;
}
export const priceError = (s: string) => {
  const n = parsePrice(s);
  if (n == null) return t3('Narxni kiriting', 'Укажите цену', 'Enter a price');
  if (!(n > 0)) return t3('Narx 0 dan katta boʻlishi kerak', 'Цена должна быть больше 0', 'The price must be greater than 0');
  return '';
};
export function ErrText({ children }: { children?: ReactNode }) {
  return children ? <span className="mt-1 block text-sm text-bad">{children}</span> : null;
}
export function Section({ title, sub, actions, children, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold">{title}</h2>}
            {sub && <p className="mt-1 text-sm text-ink-3">{sub}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- sessions

export function SoldCell({ sid }: { sid: string }) {
  useI18n();
  const u = unitInfo(sid);
  const st = u ? unitStock(u) : { total: 0, free: 0 };
  const sold = sessionSold(sid);
  const pct = st.total ? Math.min(100, Math.round((sold / st.total) * 100)) : 0;
  return (
    <div className="min-w-24">
      <div className="text-sm tabular-nums">
        {sold} / {st.total}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/5" aria-hidden>
        <div className="h-full rounded-full bg-ok" style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}
/** "Delete" of a session: enabled only without sales and holds (US-20). */
export function DeleteSessionButton({ s, ro, onDone }: { s: Session; ro?: boolean; onDone?: () => void }) {
  const { t3 } = useI18n();
  if (ro) return null;
  const st = delState(s.id);
  const run = async () => {
    if (st !== 'ok') {
      toast(delHint(st), 'warn');
      return;
    }
    const ok = await confirmBox({
      title: t3('{w} seansi oʻchirilsinmi?', 'Удалить сеанс {w}?', 'Delete the session on {w}?', { w: fmtDT(s.startsAt) }),
      text: t3('Seans vitrina va kassadan yoʻqoladi.', 'Сеанс исчезнет с витрины и из кассы.', 'It disappears from the storefront and the box office.'),
      danger: true,
      ok: t3('Oʻchirish', 'Удалить', 'Delete'),
    });
    if (!ok) return;
    const r = deleteSession(s.id);
    if (r === 'ok' || r === 'gone') {
      toast(t3('Seans oʻchirildi', 'Сеанс удалён', 'Session deleted'), 'ok');
      onDone?.();
    } else toast(delHint(r), 'bad');
  };
  return (
    <Button variant="ghost" size="sm" onClick={run} title={st !== 'ok' ? delHint(st) : undefined} className={st !== 'ok' ? 'text-ink-3' : 'text-bad'}>
      <Trash2 className="size-4" />
      <span className="hidden sm:inline">{t3('Oʻchirish', 'Удалить', 'Delete')}</span>
    </Button>
  );
}
