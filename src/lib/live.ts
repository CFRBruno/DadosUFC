// Resultados ao vivo: o navegador consulta o placar público da ESPN (a API aceita chamadas de qualquer site).
// Um único consultor compartilhado serve todos os componentes: 20 s com luta rolando ou prestes a começar,
// 60 s nos demais casos, e pausa com a aba escondida.
import { useSyncExternalStore } from 'react';

export interface LiveBout {
  state: 'pre' | 'live' | 'done';
  /** round atual (ao vivo) ou em que acabou */
  period: number;
  rounds: number;
  /** relógio do round (ao vivo) ou minutagem em que acabou */
  clock: string;
  winner: string | null;
  method: string | null;
  names: [string, string];
}

interface Snapshot { bouts: Map<string, LiveBout>; liveEvents: Set<string>; fetchedAt: number }

const URL = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const pairKey = (a: string, b: string) => [norm(a), norm(b)].sort().join('|');

const METHOD: [RegExp, string][] = [[/kotko|ko|tko/i, 'KO/TKO'], [/submission|sub/i, 'Finalização'], [/decision/i, 'Decisão']];

interface EspnComp {
  status: { period?: number; displayClock?: string; type: { name: string } };
  format?: { regulation?: { periods?: number } };
  competitors: { winner?: boolean; athlete: { displayName: string } }[];
  details?: { type?: { text?: string } }[];
}
interface EspnEvent { id: string; status: { type: { name: string } }; competitions?: EspnComp[] }

function parse(events: EspnEvent[]): Snapshot {
  const bouts = new Map<string, LiveBout>();
  const liveEvents = new Set<string>();
  for (const e of events) {
    let anyLive = false;
    for (const c of e.competitions ?? []) {
      if (c.competitors.length !== 2) continue;
      const t = c.status.type.name;
      const state = t === 'STATUS_IN_PROGRESS' ? 'live' : t === 'STATUS_FINAL' ? 'done' : t === 'STATUS_PRE_FIGHT' ? 'pre' : null;
      if (!state) continue;
      const [x, y] = c.competitors.map((k) => k.athlete.displayName) as [string, string];
      const win = c.competitors.find((k) => k.winner)?.athlete.displayName ?? null;
      const txt = (c.details ?? []).map((d) => d.type?.text ?? '').find((s) => /Unofficial Winner/i.test(s)) ?? '';
      const method = state === 'done' ? METHOD.find(([re]) => re.test(txt.replace(/Unofficial Winner/i, '')))?.[1] ?? null : null;
      if (state === 'live') anyLive = true;
      bouts.set(`${e.id}|${pairKey(x, y)}`, { state, period: c.status.period ?? 0, rounds: c.format?.regulation?.periods ?? 3, clock: c.status.displayClock ?? '', winner: win, method, names: [x, y] });
      bouts.set(pairKey(x, y), bouts.get(`${e.id}|${pairKey(x, y)}`)!);
    }
    if (anyLive || e.status.type.name === 'STATUS_IN_PROGRESS') liveEvents.add(e.id);
  }
  return { bouts, liveEvents, fetchedAt: Date.now() };
}

let snap: Snapshot = { bouts: new Map(), liveEvents: new Set(), fetchedAt: 0 };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function tick() {
  timer = null;
  let next = 60_000;
  if (!document.hidden) {
    try {
      const res = await fetch(`${URL}?t=${Math.floor(Date.now() / 10_000)}`); // sem cabeçalhos extras: evita o preflight de CORS
      if (res.ok) {
        snap = parse(((await res.json()) as { events?: EspnEvent[] }).events ?? []);
        subs.forEach((f) => f());
        if (snap.liveEvents.size || [...snap.bouts.values()].some((b) => b.state !== 'done')) next = 20_000;
      }
    } catch { /* sem rede: tenta de novo no próximo ciclo */ }
  }
  if (subs.size) timer = setTimeout(tick, next);
}

function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1 && !timer) void tick();
  const vis = () => { if (!document.hidden && subs.size && !timer) void tick(); };
  document.addEventListener('visibilitychange', vis);
  return () => {
    subs.delete(f);
    document.removeEventListener('visibilitychange', vis);
    if (!subs.size && timer) { clearTimeout(timer); timer = null; }
  };
}

/** Estado ao vivo atual (atualiza sozinho enquanto algum componente o usa). */
export function useLive(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap);
}

export function liveOf(s: Snapshot, eventId: string | null | undefined, a: string, b: string): LiveBout | null {
  return (eventId && s.bouts.get(`${eventId.replace(/^espn-/, '')}|${pairKey(a, b)}`)) || s.bouts.get(pairKey(a, b)) || null;
}
