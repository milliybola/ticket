/* Storefront shell in the iticket.uz style: sticky white header with categories, yellow accents, dark-on-light footer. */
import { clsx } from 'clsx';
import { Menu, Search, Ticket, User, X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useItCategories } from '../../api/iticket';
import { LANG_SHORT, LANGS, t3, tl, useI18n } from '../../lib/i18n';
import { LOCAL_CATEGORIES } from '../../domain/storefront';
import { Logo } from '../common';
import { Loading } from '../ui';

export function useNavCategories() {
  const { data } = useItCategories();
  const it = (data || []).filter((c) => !c.external_url).map((c) => ({ slug: c.slug, name: c.name }));
  const local = LOCAL_CATEGORIES.map((c) => ({ slug: c.slug, name: tl(c.name) }));
  return [...it, ...local];
}

function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={clsx('flex items-center gap-1 text-sm font-semibold', className)}>
      {LANGS.map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} className={clsx('rounded-md px-1.5 py-1', l === lang ? 'text-ink' : 'text-ink-3 hover:text-ink')}>
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  return (
    <form
      className="flex w-full items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
        onDone();
      }}
    >
      <Search className="size-5 shrink-0 text-ink-3" />
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t3('Tadbir, ijrochi yoki joyni qidiring', 'Поиск мероприятий, артистов, площадок', 'Search events, artists, venues')} className="h-12 min-w-0 flex-1 bg-transparent text-lg outline-none" />
      <button type="button" onClick={onDone} className="grid size-10 place-items-center rounded-full hover:bg-black/5" aria-label="Close">
        <X className="size-5" />
      </button>
    </form>
  );
}

export function PublicHeader() {
  useI18n();
  const cats = useNavCategories();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setDrawer(false);
    setSearch(false);
  }, [loc.pathname]);
  const visible = cats.slice(0, 8);
  const hidden = cats.slice(8);
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 lg:h-20 lg:px-5">
        <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-black/5 lg:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
          <Menu className="size-6" />
        </button>
        <Logo />
        {search ? (
          <div className="flex min-w-0 flex-1">
            <SearchBox onDone={() => setSearch(false)} />
          </div>
        ) : (
          <>
            <nav className="no-scrollbar hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
              <NavLink to="/events" end className={({ isActive }) => clsx('shrink-0 rounded-full px-3 py-2 text-[15px] font-semibold whitespace-nowrap', isActive ? 'bg-brand' : 'hover:bg-black/5')}>
                {t3('Barcha tadbirlar', 'Все события', 'All events')}
              </NavLink>
              {visible.map((c) => (
                <NavLink key={c.slug} to={`/events/${c.slug}`} className={({ isActive }) => clsx('shrink-0 rounded-full px-3 py-2 text-[15px] font-medium whitespace-nowrap', isActive ? 'bg-brand font-semibold' : 'hover:bg-black/5')}>
                  {c.name}
                </NavLink>
              ))}
              {hidden.length > 0 && (
                <div className="group relative shrink-0">
                  <button type="button" aria-haspopup="true" aria-label={t3('Yana', 'Ещё', 'More')} className="rounded-full px-3 py-2 text-[15px] font-medium hover:bg-black/5">
                    •••
                  </button>
                  <div className="invisible absolute top-full right-0 z-10 min-w-48 rounded-2xl bg-white p-2 shadow-xl group-focus-within:visible group-hover:visible">
                    {hidden.map((c) => (
                      <Link key={c.slug} to={`/events/${c.slug}`} className="block rounded-xl px-3 py-2 hover:bg-black/5">
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <LangSwitch className="mr-1 hidden md:flex" />
              <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-black/5" onClick={() => setSearch(true)} aria-label={t3('Qidirish', 'Поиск', 'Search')}>
                <Search className="size-5" />
              </button>
              <Link to="/find-ticket" className="grid size-10 place-items-center rounded-full hover:bg-black/5" aria-label={t3('Chiptani topish', 'Найти билет', 'Find ticket')} title={t3('Chiptani topish', 'Найти билет', 'Find ticket')}>
                <Ticket className="size-5" />
              </Link>
              <Link to="/account" className="grid size-10 place-items-center rounded-full hover:bg-black/5" aria-label={t3('Kabinet', 'Кабинет', 'Account')} title={t3('Kabinet', 'Кабинет', 'Account')}>
                <User className="size-5" />
              </Link>
            </div>
          </>
        )}
      </div>
      {drawer && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-black/5" onClick={() => setDrawer(false)} aria-label="Close">
                <X className="size-6" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 overflow-y-auto text-lg font-semibold">
              <Link to="/events" className="rounded-xl px-3 py-2.5 hover:bg-black/5">
                {t3('Barcha tadbirlar', 'Все события', 'All events')}
              </Link>
              {cats.map((c) => (
                <Link key={c.slug} to={`/events/${c.slug}`} className="rounded-xl px-3 py-2.5 hover:bg-black/5">
                  {c.name}
                </Link>
              ))}
              <Link to="/venues" className="rounded-xl px-3 py-2.5 hover:bg-black/5">
                {t3('Joylar', 'Площадки', 'Venues')}
              </Link>
            </nav>
            <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
              <LangSwitch />
              <Link to="/organizers" className="text-sm font-semibold underline">
                {t3('Tashkilotchilarga', 'Организаторам', 'For organizers')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  useI18n();
  return (
    <footer className="mx-auto mt-20 max-w-[1280px] px-6 pt-3 pb-10 lg:px-5">
      <div className="grid grid-cols-2 gap-8 border-t border-line pt-10 lg:grid-cols-4 lg:gap-10">
        <div className="col-span-2 lg:col-span-1">
          <Logo />
          <div className="mt-4 text-sm text-ink-3">{t3('Qoʻllab-quvvatlash xizmati', 'Служба поддержки', 'Support')}</div>
          <a href="tel:+998712000000" className="mt-1 block text-lg font-bold">
            +998 71 200-00-00
          </a>
        </div>
        <div>
          <div className="mb-3 font-bold">{t3('Xaridorlarga', 'Покупателям', 'For buyers')}</div>
          <nav className="flex flex-col gap-2 text-[15px] text-ink-2">
            <Link to="/page/faq">{t3('Koʻp soʻraladigan savollar', 'Частые вопросы', 'FAQ')}</Link>
            <Link to="/find-ticket">{t3('Chiptani topish', 'Найти билет', 'Find ticket')}</Link>
            <Link to="/page/rules">{t3('Foydalanish shartlari', 'Условия использования', 'Terms of use')}</Link>
            <Link to="/page/eticket">{t3('Elektron chipta', 'Электронный билет', 'E-ticket')}</Link>
            <Link to="/page/privacy">{t3('Maxfiylik siyosati', 'Политика конфиденциальности', 'Privacy policy')}</Link>
          </nav>
        </div>
        <div>
          <div className="mb-3 font-bold">Sayohat</div>
          <nav className="flex flex-col gap-2 text-[15px] text-ink-2">
            <Link to="/page/about">{t3('Biz haqimizda', 'О нас', 'About us')}</Link>
            <Link to="/venues">{t3('Joylar', 'Площадки', 'Venues')}</Link>
            <Link to="/organizers">{t3('Tashkilotchilarga', 'Организаторам', 'For organizers')}</Link>
            <Link to="/org">{t3('Tashkilotchi kabineti', 'Кабинет организатора', 'Organizer account')}</Link>
            <Link to="/mod">{t3('Moderator', 'Модератор', 'Moderator')}</Link>
          </nav>
        </div>
        <div className="col-span-2 lg:col-span-1">
          <div className="mb-3 font-bold">{t3('Xavfsizlik', 'Безопасность', 'Security')}</div>
          <p className="text-sm text-ink-3">{t3('Barcha toʻlovlar 3D Secure bilan himoyalangan: Payme, Click, Uzum, Humo, Uzcard, Visa, Mastercard.', 'Все платежи защищены 3D Secure: Payme, Click, Uzum, Humo, Uzcard, Visa, Mastercard.', 'All payments are protected by 3D Secure: Payme, Click, Uzum, Humo, Uzcard, Visa, Mastercard.')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Payme', 'Click', 'Uzum', 'Humo', 'Uzcard', 'Visa', 'Mastercard'].map((p) => (
              <span key={p} className="rounded-md border border-line bg-white px-2 py-1 text-xs font-bold text-ink-2">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 text-sm text-ink-3">
        <div>© {new Date().getFullYear()} Sayohat Tickets. {t3('Afisha maʼlumotlari iticket.uz ochiq API orqali.', 'Данные афиши — через открытый API iticket.uz.', 'Listings data via the public iticket.uz API.')}</div>
        <Link to="/demo" className="underline">
          {t3('Demo vositalari', 'Демо-инструменты', 'Demo tools')}
        </Link>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <PublicFooter />
    </div>
  );
}
