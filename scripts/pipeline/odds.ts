// Linhas de mercado (moneyline) publicadas pela ESPN — usadas SOMENTE como insumo interno
// do modelo de previsão; o site não exibe odds.
// A ESPN só mantém as linhas perto da data da luta, então cada execução guarda o que
// encontrar em data/odds/archive.json (versionado no repositório).

import { readFile, writeFile } from 'node:fs/promises';
import type { EspnData } from './espn';

export const ODDS_FILE = 'data/odds/archive.json';

export interface OddsEntry {
  /** data da luta */
  d: string;
  /** nomes como a ESPN escreve */
  a: string;
  b: string;
  /** probabilidade implícita de `a`, sem a margem da casa (mediana entre as casas) */
  p: number;
  /** nº de casas na mediana */
  n: number;
  /** linha de rounds (over/under), quando existe */
  ou?: number;
}
export type OddsArchive = Record<string, OddsEntry>;

export async function loadOdds(): Promise<OddsArchive> {
  try {
    return JSON.parse(await readFile(ODDS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveOdds(arch: OddsArchive): Promise<void> {
  const items = Object.entries(arch).sort((x, y) => x[1].d.localeCompare(y[1].d) || x[0].localeCompare(y[0]));
  // uma luta por linha: os commits diários ficam pequenos e legíveis
  await writeFile(ODDS_FILE, '{\n' + items.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
}

const implied = (ml: number) => (ml > 0 ? 100 / (ml + 100) : -ml / (-ml + 100));
const median = (v: number[]) => {
  const s = [...v].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

interface OddsItem {
  provider?: { name?: string };
  overUnder?: number;
  awayAthleteOdds?: { moneyLine?: number; athlete?: { $ref?: string } };
  homeAthleteOdds?: { moneyLine?: number; athlete?: { $ref?: string } };
}

/** Converte a resposta da ESPN em probabilidade sem margem para o 1º competidor. */
export function parseOdds(items: OddsItem[], firstId: string, secondId: string): { p: number; n: number; ou?: number } | null {
  const ps: number[] = [];
  const ous: number[] = [];
  for (const it of items) {
    if (/live/i.test(it.provider?.name ?? '')) continue; // linhas "ao vivo" já contêm o andamento da luta
    const ml: Record<string, number> = {};
    for (const side of [it.awayAthleteOdds, it.homeAthleteOdds]) {
      const id = /athletes\/(\d+)/.exec(side?.athlete?.$ref ?? '')?.[1];
      if (id && typeof side?.moneyLine === 'number') ml[id] = side.moneyLine;
    }
    if (ml[firstId] == null || ml[secondId] == null) continue;
    const pa = implied(ml[firstId]), pb = implied(ml[secondId]);
    if (!(pa > 0.02 && pa < 0.99 && pb > 0.02 && pb < 0.99)) continue;
    ps.push(pa / (pa + pb));
    if (typeof it.overUnder === 'number') ous.push(it.overUnder);
  }
  if (!ps.length) return null;
  return { p: Math.round(median(ps) * 1e4) / 1e4, n: ps.length, ...(ous.length ? { ou: median(ous) } : {}) };
}

/**
 * Busca as linhas das lutas marcadas (e completa as dos últimos dias, se faltarem).
 * Lutas futuras são regravadas a cada execução — a linha mais próxima da luta é a mais informativa;
 * depois que a luta começa, o registro não é mais alterado.
 */
export async function updateOdds(arch: OddsArchive, espn: EspnData, offline: boolean): Promise<void> {
  if (offline) return;
  const now = Date.now();
  const todo: { event: string; comp: string; date: string; a: { id: string; name: string }; b: { id: string; name: string } }[] = [];
  for (const e of espn.events) {
    for (const c of e.competitions ?? []) {
      if (!c.id || c.competitors.length !== 2) continue;
      const t = Date.parse(c.date);
      const future = t > now;
      const recent = !future && now - t < 3 * 864e5 && !arch[c.id];
      if (!future && !recent) continue;
      const [x, y] = c.competitors;
      todo.push({ event: e.id, comp: c.id, date: c.date.slice(0, 10), a: { id: x.id, name: x.athlete.displayName }, b: { id: y.id, name: y.athlete.displayName } });
    }
  }
  let i = 0, got = 0, changed = 0, failed = 0;
  const worker = async () => {
    while (i < todo.length) {
      const t = todo[i++];
      try {
        const url = `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${t.event}/competitions/${t.comp}/odds?limit=50`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const o = parseOdds(((await res.json()) as { items?: OddsItem[] }).items ?? [], t.a.id, t.b.id);
        if (!o) continue;
        got++;
        const next: OddsEntry = { d: t.date, a: t.a.name, b: t.b.name, ...o };
        if (JSON.stringify(arch[t.comp]) !== JSON.stringify(next)) changed++;
        arch[t.comp] = next;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  if (changed) await saveOdds(arch);
  console.log(`  ✓ Mercado: ${got} de ${todo.length} lutas marcadas com linha (${changed} novas/atualizadas${failed ? `, ${failed} falhas` : ''}); arquivo com ${Object.keys(arch).length} lutas`);
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Devolve uma função que encontra a probabilidade de mercado do lutador `a`
 * numa luta (data com tolerância de ±1 dia por causa do fuso; nomes normalizados).
 */
export function marketLookup(arch: OddsArchive): (date: string | null, a: string, b: string) => number | null {
  const idx = new Map<string, { names: [string, string]; p: number }[]>();
  for (const e of Object.values(arch)) {
    const rec = { names: [norm(e.a), norm(e.b)] as [string, string], p: e.p };
    const t = Date.parse(e.d);
    for (const k of [0, -1, 1]) {
      const d = new Date(t + k * 864e5).toISOString().slice(0, 10);
      if (!idx.has(d)) idx.set(d, []);
      idx.get(d)!.push(rec);
    }
  }
  return (date, an, bn) => {
    if (!date) return null;
    const a = norm(an), b = norm(bn);
    const day = idx.get(date) ?? [];
    const exact = day.find((r) => r.names.includes(a) && r.names.includes(b));
    if (exact) return exact.names[0] === a ? exact.p : 1 - exact.p;
    // grafias diferentes: aceita quando só uma luta do dia tem um dos dois nomes
    const cand = day.filter((r) => r.names.includes(a) || r.names.includes(b));
    if (cand.length === 1) {
      const r = cand[0];
      return r.names[0] === a || r.names[1] === b ? r.p : 1 - r.p;
    }
    return null;
  };
}
