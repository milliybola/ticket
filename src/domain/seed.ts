/*
 * The starting state of the local backend. Events, venues and organizers are not invented here: they are imported
 * from iticket.uz (src/sync/iticket.ts). Only Sayohat's own moderators exist from the start.
 */
import { now } from '../lib/time';
import { DB_VERSION } from '../store/db';
import type { Db } from './types';

export function seedDb(): Db {
  return {
    v: DB_VERSION,
    rev: 0,
    createdAt: now(),
    syncedAt: null,
    demo: { clock: 0, passportUp: true, boxOnline: true, entryOnline: true },
    orgs: [],
    mods: [
      { id: 'mod1', name: 'Malika Yusupova', email: 'malika@sayohat.uz', password: 'demo1234' },
      { id: 'mod2', name: 'Timur Rashidov', email: 'timur@sayohat.uz', password: 'demo1234' },
    ],
    venues: [],
    schemes: {},
    venueReqs: [],
    events: [],
    sessions: [],
    holds: [],
    orders: [],
    tickets: [],
    outbox: [],
    log: [],
    buyers: [],
  };
}
