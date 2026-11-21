import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFighters } from '../lib/data';
import { initials } from '../lib/format';
import type { FighterSummary } from '../shared/types';

type IconName = 'home' | 'users' | 'swords' | 'calendar' | 'chart' | 'x' | 'up' | 'down' | 'chev' | 'info' | 'trophy' | 'belt' | 'more' | 'search' | 'copy' | 'share';

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, ReactNode> = {
    home: <path {...p} d="M3 11 12 4l9 7M5 10v10h14V10" />,
    users: <><circle {...p} cx="9" cy="8" r="3.5" /><path {...p} d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.1 2.4 3.5 5.2" /></>,
    swords: <path {...p} d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l-2 2 3 3 2-2M3 21l2-2" />,
    calendar: <><rect {...p} x="3.5" y="5" width="17" height="15" rx="2" /><path {...p} d="M3.5 10h17M8 3v4M16 3v4" /></>,
    chart: <path {...p} d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    x: <path {...p} d="M6 6l12 12M18 6 6 18" />,
    up: <path {...p} d="M12 19V5M6 11l6-6 6 6" />,
    down: <path {...p} d="M12 5v14M6 13l6 6 6-6" />,
    chev: <path {...p} d="m6 9 6 6 6-6" />,
    info: <><circle {...p} cx="12" cy="12" r="9" /><path {...p} d="M12 11v6M12 7.5v.5" /></>,
    trophy: <path {...p} d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5" />,
    belt: <><rect {...p} x="2" y="9" width="20" height="6" rx="1.5" /><rect {...p} x="8.5" y="7" width="7" height="10" rx="2" /><circle {...p} cx="12" cy="12" r="1.6" /></>,
    copy: <><rect {...p} x="8" y="8" width="12" height="12" rx="2" /><path {...p} d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    share: <><circle {...p} cx="6" cy="12" r="2.6" /><circle {...p} cx="18" cy="6" r="2.6" /><circle {...p} cx="18" cy="18" r="2.6" /><path {...p} d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6" /></>,
    search: <><circle {...p} cx="11" cy="11" r="6.5" /><path {...p} d="m16 16 4.5 4.5" /></>,
    more: <><circle cx="5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="19" cy="12" r="1.8" fill="currentColor" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" width="20" height="20">
      {paths[name]}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="57.9,42.7 42.7,57.9 21.3,57.9 6.1,42.7 6.1,21.3 21.3,6.1 42.7,6.1 57.9,21.3" fill="none" stroke="#ed1c24" strokeWidth="4" strokeLinejoin="round" />
      <path d="M16.6 25.5V35a3.4 3.4 0 0 0 6.8 0V25.5M28.6 40V25.5H35.4M28.6 32.6H34.2M47.2 29c-1.3-2.4-3.2-3.5-5.4-3.5-3 0-4.8 2.2-4.8 5.4v4.2c0 3.2 1.8 5.4 4.8 5.4 2.2 0 4.1-1.1 5.4-3.5" fill="none" stroke="#fff" strokeWidth="3.3" />
      <rect x="19" y="45.2" width="26" height="3" rx="1.5" fill="#ed1c24" />
    </svg>
  );
}

type PhotoMap = Map<string, { url: string; page: string | null }>;
const EMPTY: PhotoMap = new Map();
const photoMaps = new WeakMap<object, PhotoMap>();

/** Mapa id → foto, montado uma única vez a partir da lista de lutadores. */
function usePhotoMap(): PhotoMap {
  const list = useFighters().data;
  if (!list) return EMPTY;
  let m = photoMaps.get(list);
  if (!m) {
    m = new Map(list.filter((f) => f.photo).map((f) => [f.id, { url: f.photo!, page: f.photoPage }]));
    photoMaps.set(list, m);
  }
  return m;
}

export function Avatar({ name, id, side, size }: { name: string; id?: string | null; side?: 'a' | 'b'; size?: 'sm' | 'lg' }) {
  const photos = usePhotoMap();
  const [failed, setFailed] = useState(false);
  const photo = id ? photos.get(id) : undefined;
  return (
    <div className={['avatar', side, size, photo && !failed ? 'has-photo' : ''].filter(Boolean).join(' ')} aria-hidden="true">
      {photo && !failed ? (
        <img src={photo.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <div className="spinner" />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="empty">
      <p>Não foi possível carregar os dados ({message}).</p>
      <p className="note" style={{ marginTop: 8 }}>
        Se você está rodando localmente, gere os dados com <code>npm run data</code>.
      </p>
    </div>
  );
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Texto com marcações simples:
 *   **negrito**, [a:texto] / [b:texto] (cor do lutador A/B).
 * Com `a` e `b`, os nomes dos lutadores são coloridos automaticamente; um trecho
 * em negrito que cita só um dos lutadores fica inteiro na cor dele.
 */
export function Rich({ text, a, b }: { text: string; a?: string; b?: string }) {
  const names = [a, b].filter((n): n is string => !!n).sort((x, y) => y.length - x.length);
  const nameRe = names.length ? new RegExp(`(${names.map(esc).join('|')})`, 'g') : null;
  const sideOf = (n: string) => (n === a ? 'fa' : n === b ? 'fb' : '');
  let k = 0;

  const plain = (str: string, bold: boolean) => {
    const out: ReactNode[] = [];
    for (const part of str.split(/(\[[ab]:[^\]]+\])/g)) {
      const m = part.match(/^\[([ab]):([^\]]+)\]$/);
      if (m) {
        out.push(bold ? <b key={k++} className={`f${m[1]}`}>{m[2]}</b> : <span key={k++} className={`f${m[1]}`}>{m[2]}</span>);
        continue;
      }
      const pieces = nameRe ? part.split(nameRe) : [part];
      for (const p of pieces) {
        if (!p) continue;
        const cls = names.includes(p) ? sideOf(p) : '';
        if (cls) out.push(bold ? <b key={k++} className={cls}>{p}</b> : <span key={k++} className={cls}>{p}</span>);
        else out.push(bold ? <b key={k++}>{p}</b> : <Fragment key={k++}>{p}</Fragment>);
      }
    }
    return out;
  };

  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{plain(p, false)}</Fragment>;
        // negrito: se cita só um lutador (e não tem marcação própria), pinta o trecho todo
        if (!/\[[ab]:/.test(p) && a && b) {
          const hasA = p.includes(a), hasB = p.includes(b);
          if (hasA !== hasB) return <b key={i} className={hasA ? 'fa' : 'fb'}>{p}</b>;
        }
        return <Fragment key={i}>{plain(p, true)}</Fragment>;
      })}
    </>
  );
}

export function ResultBadge({ r }: { r: 'W' | 'L' | 'D' | 'NC' }) {
  const label = { W: 'V', L: 'D', D: 'E', NC: 'NC' }[r];
  const title = { W: 'Vitória', L: 'Derrota', D: 'Empate', NC: 'Sem resultado' }[r];
  return (
    <span className={`res res-${r}`} title={title} aria-label={title}>
      {label}
    </span>
  );
}

export function Flag({ src, country }: { src?: string | null; country?: string | null }) {
  if (!src) return null;
  return <img className="flag" src={src} alt={country ?? ''} title={country ?? ''} width={18} height={18} loading="lazy" referrerPolicy="no-referrer" />;
}

/** Selo "Prospecto" (até 5 lutas no UFC, números acima da média, termina cedo), achado pelo id do lutador. */
export function ProspectTag({ id, compact }: { id?: string | null; compact?: boolean }) {
  const list = useFighters().data;
  if (!list || !id) return null;
  const p = prospectMap(list).get(id);
  return p ? <span className={`prospect-tag${compact ? ' compact' : ''}`} title={`Prospecto #${p.rank}: ${p.tags.slice(0, 2).join(' · ')}`}>{compact ? 'P' : 'Prospecto'}</span> : null;
}
const prospectMaps = new WeakMap<object, Map<string, NonNullable<FighterSummary['prospect']>>>();
function prospectMap(list: FighterSummary[]) {
  let m = prospectMaps.get(list);
  if (!m) { m = new Map(); for (const f of list) if (f.prospect) m.set(f.id, f.prospect); prospectMaps.set(list, m); }
  return m;
}

type FlagMap = Map<string, { flag: string; country: string }>;
const flagMaps = new WeakMap<object, FlagMap>();
/** Bandeira do lutador, achada pelo id (ou pelo slug) na lista de lutadores. */
export function FighterFlag({ id, slug }: { id?: string | null; slug?: string | null }) {
  const list = useFighters().data;
  if (!list || (!id && !slug)) return null;
  let m = flagMaps.get(list);
  if (!m) {
    m = new Map();
    for (const f of list) if (f.flag) { const v = { flag: f.flag, country: f.country }; m.set(f.id, v); m.set(f.slug, v); }
    flagMaps.set(list, m);
  }
  const v = (id && m.get(id)) || (slug && m.get(slug)) || null;
  return v ? <><Flag src={v.flag} country={v.country} />{' '}</> : null;
}

/** Número que "sobe" até o valor (ease-out); respeita prefers-reduced-motion. */
export function CountUp({ value, format, ms = 900, delay = 0, fromZero = false, accelerate = false, onProgress }: {
  value: number; format: (n: number) => string; ms?: number; delay?: number;
  /** começa devagar e acelera até o fim (em vez de desacelerar na chegada) */
  accelerate?: boolean;
  /** começa em 0 na primeira exibição (em vez de já mostrar o valor final) */
  fromZero?: boolean;
  /** fração do caminho já percorrida (0–1) a cada quadro, acompanhando o número mostrado */
  onProgress?: (k: number) => void;
}) {
  const [shown, setShown] = useState(fromZero ? 0 : value);
  const from = useRef(fromZero ? 0 : 0);
  const cb = useRef(onProgress);
  cb.current = onProgress;
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); cb.current?.(1); return; }
    const a = from.current;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, Math.max(0, (t - start) / ms));
      const e = accelerate ? Math.pow(k, 2.6) : 1 - Math.pow(1 - k, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      cb.current?.(k >= 1 ? 1 : e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [value, ms, delay, accelerate]);
  return <>{format(shown)}</>;
}
