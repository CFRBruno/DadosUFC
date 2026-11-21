// Divisão do card (principal, preliminar, preliminar inicial) de cada luta, segundo a ESPN.
// A lista de lutas do placar não traz o trecho do card; ele vem de uma consulta por luta à API "core".
// Eventos já encerrados ficam em cache para sempre; os próximos são consultados de novo a cada execução
// (a ESPN reorganiza o card até perto da data).

import { readFile, writeFile } from 'node:fs/promises';
import type { EspnData } from './espn';

const CACHE = 'data/raw/cache-segments.json';
export type Segment = 'main' | 'prelims' | 'early';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const segOf = (desc: string, name: string): Segment | null => {
  const t = `${desc} ${name}`.toLowerCase();
  if (/early/.test(t)) return 'early';
  if (/main/.test(t)) return 'main';
  if (/prelim/.test(t)) return 'prelims';
  return null;
};

export type SegmentLookup = (date: string | null, a: string, b: string) => Segment | null;

export async function loadSegments(espn: EspnData, offline: boolean): Promise<SegmentLookup> {
  let cache: Record<string, Segment | ''> = {};
  try { cache = JSON.parse(await readFile(CACHE, 'utf8')); } catch { /* sem cache */ }
  if (!offline) {
    const todo: { event: string; comp: string }[] = [];
    for (const e of espn.events) {
      const final = e.status.type.name === 'STATUS_FINAL';
      for (const c of e.competitions ?? []) {
        if (!c.id) continue;
        if (final && c.id in cache) continue;
        todo.push({ event: e.id, comp: c.id });
      }
    }
    let i = 0, ok = 0, failed = 0;
    const worker = async () => {
      while (i < todo.length) {
        const t = todo[i++];
        try {
          const res = await fetch(`https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${t.event}/competitions/${t.comp}?lang=en&region=us`, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { cardSegment?: { description?: string; name?: string } };
          cache[t.comp] = segOf(j.cardSegment?.description ?? '', j.cardSegment?.name ?? '') ?? '';
          ok++;
        } catch { failed++; }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    if (ok) await writeFile(CACHE, JSON.stringify(cache));
    console.log(`  ✓ Card (principal/preliminar): ${ok} lutas consultadas${failed ? `, ${failed} falhas` : ''}; cache com ${Object.keys(cache).length}`);
  }
  const idx = new Map<string, Segment>();
  for (const e of espn.events) {
    for (const c of e.competitions ?? []) {
      const s = c.id ? cache[c.id] : '';
      if (!s || c.competitors.length !== 2) continue;
      const pair = c.competitors.map((k) => norm(k.athlete.displayName)).sort().join('|');
      const t = Date.parse(c.date.slice(0, 10));
      for (const k of [0, -1, 1]) idx.set(`${new Date(t + k * 864e5).toISOString().slice(0, 10)}|${pair}`, s);
    }
  }
  return (date, a, b) => (date ? idx.get(`${date}|${[norm(a), norm(b)].sort().join('|')}`) ?? null : null);
}
