/* Small shared visuals: logo, generated posters for local events, QR codes. */
import QRCode from 'qrcode';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { tl } from '../lib/i18n';
import type { EventCard } from '../domain/types';

export function Logo({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  return (
    <Link to="/" className={'inline-flex items-center gap-2 font-extrabold tracking-tight ' + className} aria-label="Sayohat Tickets">
      <span className="grid size-9 place-items-center rounded-xl bg-brand">
        <svg viewBox="0 0 64 64" className="size-6" aria-hidden>
          <path d="M10 20a5 5 0 0 0 5-5h34a5 5 0 0 0 5 5v7a5 5 0 0 0 0 10v7a5 5 0 0 0-5 5H15a5 5 0 0 0-5-5v-7a5 5 0 0 0 0-10z" fill="#111" />
          <path d="M26 25h12M26 32h12M26 39h7" stroke="#ffdd00" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className={'text-xl leading-none ' + (dark ? 'text-white' : 'text-ink')}>
        sayohat<span className="text-ink-3">.uz</span>
      </span>
    </Link>
  );
}

/** QR code as inline SVG (crisp on screen and in print). */
export function Qr({ text, size = 160, className = '' }: { text: string; size?: number; className?: string }) {
  const d = useMemo(() => qrPath(text), [text]);
  return (
    <svg viewBox={`0 0 ${d.n} ${d.n}`} width={size} height={size} className={className} role="img" aria-label="QR">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d.path} fill="#000" shapeRendering="crispEdges" />
    </svg>
  );
}
export function qrPath(text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const q = 2;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) path += `M${c + q} ${r + q}h1v1h-1z`;
  return { path, n: n + q * 2 };
}

const MOTIFS: Record<string, string> = {
  star: 'M50 8l10 28h30l-24 18 9 29-25-18-25 18 9-29-24-18h30z',
  arch: 'M15 95V50a35 35 0 0 1 70 0v45h-14V52a21 21 0 0 0-42 0v43z',
  wave: 'M0 60q12-16 25 0t25 0 25 0 25 0v40H0z',
  vase: 'M38 10h24v8c0 6 14 14 14 34 0 24-12 38-26 38S24 76 24 52c0-20 14-28 14-34z',
  film: 'M10 22h80v56H10zM18 28v8h8v-8zm0 18v8h8v-8zm0 18v8h8v-8zm56-36v8h8v-8zm0 18v8h8v-8zm0 18v8h8v-8z',
  ball: 'M50 8a42 42 0 1 0 0 84 42 42 0 0 0 0-84zm0 14l14 10-5 16H41l-5-16z',
  mic: 'M50 10a12 12 0 0 1 12 12v24a12 12 0 0 1-24 0V22a12 12 0 0 1 12-12zM30 44h6a14 14 0 0 0 28 0h6a20 20 0 0 1-17 20v16h-6V64a20 20 0 0 1-17-20z',
};

/** Poster of a local event: the uploaded image, or a generated one from a hue and a motif. */
export function Poster({ card, className = '', showTitle = true }: { card: EventCard; className?: string; showTitle?: boolean }) {
  if (card.poster.image)
    return (
      <img
        src={card.poster.image}
        alt={tl(card.title)}
        className={'size-full object-cover ' + className}
        style={card.poster.bg ? { backgroundImage: `url(${card.poster.bg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        loading="lazy"
      />
    );
  const h = card.poster.hue;
  const motif = MOTIFS[card.poster.motif] || MOTIFS.star;
  return (
    <div className={'relative size-full overflow-hidden ' + className} style={{ background: `linear-gradient(160deg, hsl(${h} 70% 46%), hsl(${(h + 40) % 360} 65% 22%))` }}>
      <svg viewBox="0 0 100 100" className="absolute -right-6 -bottom-4 size-[85%] opacity-25" aria-hidden>
        <path d={motif} fill="#fff" />
      </svg>
      <svg viewBox="0 0 100 100" className="absolute top-4 left-4 size-10 opacity-90" aria-hidden>
        <path d={motif} fill={`hsl(${(h + 180) % 360} 90% 70%)`} />
      </svg>
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 p-4 text-lg leading-tight font-extrabold text-white drop-shadow-sm" style={{ textWrap: 'balance' }}>
          {tl(card.title)}
        </div>
      )}
    </div>
  );
}
