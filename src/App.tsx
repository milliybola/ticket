import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { PublicLayout } from './components/layout/PublicLayout';
import { ModLayout, OrgLayout } from './components/layout/CabinetLayout';
import { Loading, Toaster } from './components/ui';
import { SyncGate } from './components/SyncGate';

const P = {
  Home: lazy(() => import('./pages/public/Home')),
  Events: lazy(() => import('./pages/public/Events')),
  ItEventPage: lazy(() => import('./pages/public/ItEventPage')),
  ItSessionPage: lazy(() => import('./pages/public/ItSessionPage')),
  LocalEventPage: lazy(() => import('./pages/public/LocalEventPage')),
  Checkout: lazy(() => import('./pages/public/Checkout')),
  OrderPage: lazy(() => import('./pages/public/OrderPage')),
  FindTicket: lazy(() => import('./pages/public/FindTicket')),
  Account: lazy(() => import('./pages/public/Account')),
  Venues: lazy(() => import('./pages/public/Venues')),
  VenuePage: lazy(() => import('./pages/public/VenuePage')),
  Search: lazy(() => import('./pages/public/Search')),
  StaticPage: lazy(() => import('./pages/public/StaticPage')),
  OrganizerLanding: lazy(() => import('./pages/public/OrganizerLanding')),
  NotFound: lazy(() => import('./pages/public/NotFound')),
  Demo: lazy(() => import('./pages/public/Demo')),
};
const O = {
  OrgLogin: lazy(() => import('./pages/org/OrgLogin')),
  OrgRegister: lazy(() => import('./pages/org/OrgRegister')),
  OrgHome: lazy(() => import('./pages/org/OrgHome')),
  OrgApplication: lazy(() => import('./pages/org/OrgApplication')),
  OrgVenues: lazy(() => import('./pages/org/OrgVenues')),
  OrgVenue: lazy(() => import('./pages/org/OrgVenue')),
  SchemeEditor: lazy(() => import('./pages/org/SchemeEditor')),
  OrgEvents: lazy(() => import('./pages/org/OrgEvents')),
  EventEditor: lazy(() => import('./pages/org/EventEditor')),
  Reports: lazy(() => import('./pages/org/Reports')),
  BoxOffice: lazy(() => import('./pages/box/BoxOffice')),
  Entry: lazy(() => import('./pages/box/Entry')),
};
const M = {
  ModLogin: lazy(() => import('./pages/mod/ModLogin')),
  ModOrgs: lazy(() => import('./pages/mod/ModOrgs')),
  ModEvents: lazy(() => import('./pages/mod/ModEvents')),
  ModEventReview: lazy(() => import('./pages/mod/ModEventReview')),
  ModVenueRequests: lazy(() => import('./pages/mod/ModVenueRequests')),
  ModLog: lazy(() => import('./pages/mod/ModLog')),
  ModOutbox: lazy(() => import('./pages/mod/ModOutbox')),
};

function Bare() {
  return (
    <Suspense fallback={<Loading />}>
      <Outlet />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <P.Home /> },
      { path: 'events', element: <P.Events /> },
      { path: 'events/:category', element: <P.Events /> },
      { path: 'events/:category/:slug', element: <P.ItEventPage /> },
      { path: 'events/:category/:slug/:sessionId', element: <P.ItSessionPage /> },
      { path: 'e/:eventId', element: <P.LocalEventPage /> },
      { path: 'e/:eventId/:sid', element: <P.LocalEventPage /> },
      { path: 'checkout/:holdId', element: <P.Checkout /> },
      { path: 'order/:orderId', element: <P.OrderPage /> },
      { path: 'find-ticket', element: <P.FindTicket /> },
      { path: 'account', element: <P.Account /> },
      { path: 'venues', element: <P.Venues /> },
      { path: 'venues/:slug', element: <P.VenuePage /> },
      { path: 'search', element: <P.Search /> },
      { path: 'page/:slug', element: <P.StaticPage /> },
      { path: 'organizers', element: <P.OrganizerLanding /> },
      { path: 'demo', element: <P.Demo /> },
      { path: '*', element: <P.NotFound /> },
    ],
  },
  {
    element: <Bare />,
    children: [
      { path: 'org/login', element: <O.OrgLogin /> },
      { path: 'org/register', element: <O.OrgRegister /> },
      { path: 'mod/login', element: <M.ModLogin /> },
    ],
  },
  {
    path: 'org',
    element: <OrgLayout />,
    children: [
      { index: true, element: <O.OrgHome /> },
      { path: 'application', element: <O.OrgApplication /> },
      { path: 'venues', element: <O.OrgVenues /> },
      { path: 'venues/:venueId', element: <O.OrgVenue /> },
      { path: 'venues/:venueId/halls/:hallId', element: <O.SchemeEditor /> },
      { path: 'events', element: <O.OrgEvents /> },
      { path: 'events/new', element: <O.EventEditor /> },
      { path: 'events/:eventId', element: <O.EventEditor /> },
      { path: 'events/:eventId/:step', element: <O.EventEditor /> },
      { path: 'reports', element: <O.Reports /> },
      { path: 'box', element: <O.BoxOffice /> },
      { path: 'entry', element: <O.Entry /> },
    ],
  },
  {
    path: 'mod',
    element: <ModLayout />,
    children: [
      { index: true, element: <M.ModOrgs /> },
      { path: 'events', element: <M.ModEvents /> },
      { path: 'events/:eventId', element: <M.ModEventReview /> },
      { path: 'venue-requests', element: <M.ModVenueRequests /> },
      { path: 'log', element: <M.ModLog /> },
      { path: 'outbox', element: <M.ModOutbox /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncGate>
        <RouterProvider router={router} />
      </SyncGate>
      <Toaster />
    </QueryClientProvider>
  );
}
