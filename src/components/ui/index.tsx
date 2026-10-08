/* Shared UI primitives in the iticket.uz style. Screens compose these instead of styling raw elements. */
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Link, type LinkProps } from 'react-router';

export { clsx as cn };

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'ok' | 'soft';
type Size = 'sm' | 'md' | 'lg';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-ink hover:bg-brand-hover disabled:bg-line disabled:text-ink-3',
  dark: 'bg-ink text-white hover:bg-ink-2 disabled:bg-line-2 disabled:text-white',
  outline: 'border border-line-2 bg-white text-ink hover:border-ink disabled:text-ink-3 disabled:border-line',
  ghost: 'text-ink hover:bg-black/5 disabled:text-ink-3',
  danger: 'bg-bad text-white hover:brightness-95 disabled:opacity-50',
  ok: 'bg-ok text-white hover:brightness-95 disabled:opacity-50',
  soft: 'bg-black/5 text-ink hover:bg-black/10 disabled:text-ink-3',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-5 text-[15px] rounded-xl gap-2',
  lg: 'h-14 px-8 text-lg rounded-2xl gap-2.5',
};
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', block, loading, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx('inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors select-none', VARIANT[variant], SIZE[size], block && 'w-full', className)}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});
export function LinkButton({ variant = 'primary', size = 'md', block, className, ...rest }: LinkProps & { variant?: Variant; size?: Size; block?: boolean }) {
  return <Link className={clsx('inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors', VARIANT[variant], SIZE[size], block && 'w-full', className)} {...rest} />;
}
export function IconButton({ className, label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx('inline-flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-black/5 disabled:opacity-40', className)} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- form fields

/** Inputs fill their container unless the caller gives them a width (Tailwind cannot tell which of two width classes wins). */
const fullUnlessSized = (className?: string) => (/(^|s)(w-|flex-1)/.test(className || '') ? '' : 'w-full');
const fieldCls = 'rounded-xl border bg-white px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink disabled:bg-page disabled:text-ink-3';
export function Field({ label, error, hint, children, className, required }: { label?: ReactNode; error?: string | false | null; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={clsx('block', className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-ink-2">
          {label}
          {required && <span className="text-bad"> *</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-sm text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={clsx(fieldCls, fullUnlessSized(className), 'h-11', invalid ? 'border-bad' : 'border-line-2', className)} aria-invalid={invalid || undefined} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(fieldCls, fullUnlessSized(className), 'min-h-24 py-2.5', invalid ? 'border-bad' : 'border-line-2', className)} aria-invalid={invalid || undefined} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(fieldCls, fullUnlessSized(className), 'h-11 appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23555%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>")] bg-[right_12px_center] bg-no-repeat pr-9', invalid ? 'border-bad' : 'border-line-2', className)} {...rest}>
      {children}
    </select>
  );
});
export function Checkbox({ checked, onChange, label, disabled, invalid, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; invalid?: boolean; className?: string }) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-2.5 text-[15px] select-none', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input type="checkbox" className={clsx('mt-0.5 size-5 shrink-0 rounded accent-ink', invalid && 'outline outline-2 outline-bad')} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
/** Segmented control. */
export function Segmented<T extends string | number>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={clsx('inline-flex rounded-xl bg-black/5 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-lg font-medium transition-colors disabled:opacity-40', size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3.5 py-1.5 text-[15px]', o.value === value ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
/** − n + counter for zone tickets and museum ticket types. */
export function Stepper({ value, onChange, min = 0, max = 99, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line-2 bg-white">
      <button type="button" className="size-10 text-xl font-semibold disabled:text-line-2" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label="−">
        −
      </button>
      <span className="w-8 text-center font-semibold tabular-nums">{value}</span>
      <button type="button" className="size-10 text-xl font-semibold disabled:text-line-2" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label="+">
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({ className, children, pad = true }: { className?: string; children: ReactNode; pad?: boolean }) {
  return <div className={clsx('rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]', pad && 'p-5 md:p-6', className)}>{children}</div>;
}
type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'dark';
const TONE: Record<Tone, string> = {
  neutral: 'bg-black/5 text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand text-ink',
  dark: 'bg-ink text-white',
};
export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONE[tone], className)}>{children}</span>;
}
export function Notice({ tone = 'info', title, children, className, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div className={clsx('flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3 text-[15px]', TONE[tone], className)}>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={clsx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden />;
}
export function Loading({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center gap-3 py-16 text-ink-3', className)}>
      <Spinner />
      {label}
    </div>
  );
}
export function Empty({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      {icon && <div className="mb-2 text-ink-3">{icon}</div>}
      <div className="text-lg font-semibold">{title}</div>
      {children && <div className="max-w-md text-ink-3">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
export function PageHeader({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2 text-sm">{back}</div>}
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {sub && <div className="mt-1 text-ink-3">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]', className)}>
      <div className="text-sm text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-3">{sub}</div>}
    </div>
  );
}
export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={clsx('no-scrollbar flex gap-1 overflow-x-auto border-b border-line', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={clsx('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[15px] font-medium transition-colors', t.value === value ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink')}
        >
          {t.label}
          {t.count != null && <span className="rounded-full bg-black/5 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
/** Table with the cabinet look. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]', className)}>
      <table className="w-full min-w-[640px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-line text-sm text-ink-3">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:not(:last-child)]:border-b [&>tr]:border-line [&_td]:px-4 [&_td]:py-3">{children}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- modal

export function Modal({ open, onClose, title, children, footer, size = 'md', className }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-labelledby={title ? id : undefined} className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', w, className)}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 md:px-6">
          {title ? (
            <h2 id={id} className="text-xl font-bold">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 md:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- toasts

type ToastItem = { id: number; text: ReactNode; tone: Tone };
const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { ...t, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), 4200);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
/** toast('Saqlandi') / toast('Xato', 'bad'). */
export const toast = (text: ReactNode, tone: Tone = 'dark') => useToasts.getState().push({ text, tone });
export function Toaster() {
  const items = useToasts((s) => s.items);
  const drop = useToasts((s) => s.drop);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} role="status" onClick={() => drop(t.id)} className={clsx('pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-[15px] font-medium shadow-lg', TONE[t.tone])}>
          {t.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}
