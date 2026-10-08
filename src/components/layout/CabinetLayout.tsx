/* Organizer and moderator workspaces: sidebar on desktop, top bar with a drawer on phones. */
import { clsx } from 'clsx';
import { BarChart3, Building2, CalendarDays, ClipboardList, FileText, Home, Inbox, LogOut, Mail, Menu, ScanLine, ShieldCheck, Store, Users, X, type LucideIcon } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { LANG_SHORT, LANGS, t3, tl, useI18n } from '../../lib/i18n';
import { useAuth } from '../../store/auth';
import { useDb } from '../../store/db';
import { byId } from '../../lib/util';
import { ORG_STATUS } from '../../domain/rules';
import { Logo } from '../common';
import { Badge, Loading } from '../ui';

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number };

function Shell({ items, who, sub, onSignOut, banner }: { items: Item[]; who: string; sub?: React.ReactNode; onSignOut: () => void; banner?: React.ReactNode }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors', isActive ? 'bg-brand text-ink' : 'text-ink-2 hover:bg-black/5 hover:text-ink')}>
          <it.icon className="size-5 shrink-0" />
          <span className="flex-1">{it.label}</span>
          {!!it.badge && <span className="rounded-full bg-ink px-2 text-xs leading-5 font-bold text-white">{it.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
  const foot = (
    <div className="mt-auto space-y-3 border-t border-line pt-4">
      <div className="min-w-0">
        <div className="truncate font-semibold">{who}</div>
        {sub && <div className="mt-0.5 text-sm">{sub}</div>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-sm font-semibold">
          {LANGS.map((l) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={clsx('rounded-md px-1.5 py-1', l === lang ? 'bg-black/5 text-ink' : 'text-ink-3 hover:text-ink')}>
              {LANG_SHORT[l]}
            </button>
          ))}
        </div>
        <button type="button" onClick={onSignOut} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-ink-3 hover:bg-black/5 hover:text-ink">
          <LogOut className="size-4" />
          {t3('Chiqish', 'Выйти', 'Sign out')}
        </button>
      </div>
      <Link to="/" className="block text-sm text-ink-3 underline">
        {t3('Afishaga qaytish', 'На афишу', 'Back to the storefront')}
      </Link>
    </div>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-line bg-white p-4 lg:flex">
        <Logo />
        {nav}
        {foot}
      </aside>
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-white px-3 lg:hidden">
        <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-black/5" onClick={() => setOpen(true)} aria-label="Menu">
          <Menu className="size-6" />
        </button>
        <Logo />
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-white p-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-black/5" onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-6" />
              </button>
            </div>
            {nav}
            {foot}
          </div>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {banner}
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

/** Organizer cabinet. The box office and the entry check live here too, under the same login [Р1], [Р2]. */
export function OrgLayout() {
  useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId);
  const signOut = useAuth((s) => s.signOutOrg);
  const org = byId(db.orgs, orgId);
  if (!org) return <Navigate to="/org/login" replace />;
  const tone = org.status === 'approved' ? 'ok' : org.status === 'rework' ? 'bad' : 'warn';
  const items: Item[] = [
    { to: '/org', label: t3('Bosh sahifa', 'Главная', 'Overview'), icon: Home, end: true },
    { to: '/org/events', label: t3('Tadbirlar', 'Мероприятия', 'Events'), icon: CalendarDays },
    { to: '/org/venues', label: t3('Maydonlar va zallar', 'Площадки и залы', 'Venues and halls'), icon: Building2 },
    { to: '/org/box', label: t3('Kassa', 'Касса', 'Box office'), icon: Store },
    { to: '/org/entry', label: t3('Kirish nazorati', 'Проверка на входе', 'Entry check'), icon: ScanLine },
    { to: '/org/reports', label: t3('Hisobotlar', 'Отчёты', 'Reports'), icon: BarChart3 },
    { to: '/org/application', label: t3('Anketa', 'Анкета', 'Application'), icon: FileText },
  ];
  return <Shell items={items} who={org.name} sub={<Badge tone={tone}>{tl(ORG_STATUS[org.status])}</Badge>} onSignOut={signOut} />;
}

/** Moderator workspace (Sayohat staff). */
export function ModLayout() {
  useI18n();
  const db = useDb();
  const modId = useAuth((s) => s.modId);
  const signOut = useAuth((s) => s.signOutMod);
  const mod = byId(db.mods, modId);
  if (!mod) return <Navigate to="/mod/login" replace />;
  const items: Item[] = [
    { to: '/mod', label: t3('Tashkilotchilar', 'Организаторы', 'Organizers'), icon: Users, end: true, badge: db.orgs.filter((o) => o.status === 'review').length },
    { to: '/mod/events', label: t3('Moderatsiya', 'Модерация', 'Moderation'), icon: ShieldCheck, badge: db.events.filter((e) => e.status === 'moderation' || e.venueChange?.status === 'pending').length },
    { to: '/mod/venue-requests', label: t3('Maydon soʻrovlari', 'Запросы площадок', 'Venue requests'), icon: Inbox, badge: db.venueReqs.filter((r) => r.status === 'new' || r.status === 'progress').length },
    { to: '/mod/log', label: t3('Harakatlar jurnali', 'Журнал действий', 'Action log'), icon: ClipboardList },
    { to: '/mod/outbox', label: t3('Yuborilgan xabarlar', 'Отправленные уведомления', 'Sent notifications'), icon: Mail },
  ];
  return <Shell items={items} who={mod.name} sub={<span className="text-ink-3">{t3('Sayohat moderatori', 'Модератор Sayohat', 'Sayohat moderator')}</span>} onSignOut={signOut} />;
}
