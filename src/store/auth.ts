import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '../lib/util';

/**
 * Who is using this browser tab. Three platform roles (PRD): buyer (may be a guest), organizer, moderator.
 * The box office and the entry check work under the organizer's login [Р1], [Р2].
 */
type AuthState = {
  orgId: string | null;
  modId: string | null;
  /** Optional buyer account (US-35). */
  buyerId: string | null;
  /** Stable id of this browser, used as the hold owner for guests. */
  clientId: string;
  signInOrg: (id: string) => void;
  signInMod: (id: string) => void;
  signInBuyer: (id: string) => void;
  signOutOrg: () => void;
  signOutMod: () => void;
  signOutBuyer: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      orgId: null,
      modId: null,
      buyerId: null,
      clientId: uid('c'),
      signInOrg: (id) => set({ orgId: id }),
      signInMod: (id) => set({ modId: id }),
      signInBuyer: (id) => set({ buyerId: id }),
      signOutOrg: () => set({ orgId: null }),
      signOutMod: () => set({ modId: null }),
      signOutBuyer: () => set({ buyerId: null }),
    }),
    { name: 'sayohat-auth' },
  ),
);

export const getAuth = () => useAuth.getState();
