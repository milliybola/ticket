/*
 * Waits for the iticket.uz catalogue before showing the app the first time (and again after the daily reset),
 * so the storefront, the organizer cabinet and the moderator always see the same data.
 */
import { useEffect, type ReactNode } from 'react';
import { t3, useI18n } from '../lib/i18n';
import { useDb } from '../store/db';
import { refreshIfExpired, syncCatalog, useSync } from '../sync/iticket';
import { Button, Spinner } from './ui';

export function SyncGate({ children }: { children: ReactNode }) {
  useI18n();
  const db = useDb();
  const sync = useSync();
  useEffect(() => {
    refreshIfExpired().catch(() => undefined);
    // the local data (orders included) lives one day: check every minute
    const t = setInterval(() => refreshIfExpired().catch(() => undefined), 60_000);
    return () => clearInterval(t);
  }, []);
  // after a reset (demo tools, daily expiry) the catalogue is imported again right away
  useEffect(() => {
    if (!db.syncedAt && useSync.getState().status !== 'syncing' && useSync.getState().status !== 'error') syncCatalog().catch(() => undefined);
  }, [db.syncedAt]);
  if (db.syncedAt) return <>{children}</>;
  const pct = sync.total ? Math.round((sync.done / sync.total) * 100) : 0;
  return (
    <div className="grid min-h-screen place-items-center bg-page px-6">
      <div className="w-full max-w-md text-center">
        {/* outside the router: a plain brand mark, not the linked logo */}
        <div className="flex items-center justify-center gap-2 text-xl font-extrabold">
          <span className="grid size-9 place-items-center rounded-xl bg-brand">🎫</span>
          sayohat<span className="text-ink-3">.uz</span>
        </div>
        {sync.status === 'error' ? (
          <>
            <h1 className="mt-8 text-xl font-bold">{t3('iticket.uz bilan bogʻlanib boʻlmadi', 'Не удалось связаться с iticket.uz', 'Couldn’t reach iticket.uz')}</h1>
            <p className="mt-2 text-ink-3">{t3('Internetni tekshiring va qayta urinib koʻring.', 'Проверьте интернет и попробуйте ещё раз.', 'Check the connection and try again.')}</p>
            <p className="mt-1 font-mono text-xs text-ink-3">{sync.error}</p>
            <Button className="mt-6" onClick={() => syncCatalog().catch(() => undefined)}>
              {t3('Qayta urinish', 'Повторить', 'Try again')}
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-xl font-bold">{t3('Afisha iticket.uz dan yuklanmoqda', 'Загружаем афишу с iticket.uz', 'Loading the listings from iticket.uz')}</h1>
            <p className="mt-2 text-ink-3">
              {sync.stage === 'details'
                ? t3('Tadbirlar: {a} / {b}', 'Мероприятия: {a} / {b}', 'Events: {a} / {b}', { a: sync.done, b: sync.total })
                : sync.stage === 'save'
                  ? t3('Saqlanmoqda…', 'Сохраняем…', 'Saving…')
                  : t3('Roʻyxat olinmoqda…', 'Получаем список…', 'Fetching the list…')}
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${sync.stage === 'save' ? 100 : pct}%` }} />
            </div>
            <div className="mt-6 flex justify-center text-ink-3">
              <Spinner />
            </div>
            <p className="mt-6 text-xs text-ink-3">{t3('Maʼlumotlar va buyurtmalar shu brauzerda bir kun saqlanadi, keyin yangilanadi.', 'Данные и заказы хранятся в этом браузере один день, потом обновляются.', 'Data and orders are kept in this browser for one day, then refreshed.')}</p>
          </>
        )}
      </div>
    </div>
  );
}
