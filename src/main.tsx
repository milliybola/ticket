import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initDb, registerSeed } from './store/db';
import { seedDb } from './domain/seed';
import { cleanupHolds } from './domain/rules';
import { getLang } from './lib/i18n';
import { safeLS } from './lib/util';

registerSeed(seedDb);
// data of the previous version (invented demo events) is dropped: everything now comes from iticket.uz
safeLS('del', 'sayohat-db-v1');
initDb();
document.documentElement.lang = getLang();
// Expired holds go back to stock for every channel (US-30, US-38).
setInterval(cleanupHolds, 5000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
