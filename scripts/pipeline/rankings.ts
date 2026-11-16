// Ranking oficial do UFC por categoria. Desde 20/06/2026 o UFC usa o "Meta UFC Rankings"
// (modelo matemático baseado em Elo, com campeão + 15). O ufc.com bloqueia acesso
// automatizado, então lemos a tabela mantida na Wikipédia, que cita o ufc.com a cada
// atualização semanal. Resultado em cache para funcionar offline.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR } from './fetch';

const CACHE = path.join(RAW_DIR, 'wikipedia-ufc-rankings.txt');
const URL_RAW = 'https://en.wikipedia.org/w/index.php?title=UFC_rankings&action=raw';

const DIVISIONS: Record<string, string> = {
  Heavyweight: 'HW', 'Light Heavyweight': 'LHW', Middleweight: 'MW', Welterweight: 'WW', Lightweight: 'LW',
  Featherweight: 'FW', Bantamweight: 'BW', Flyweight: 'FLW',
  "Women's Bantamweight": 'WBW', "Women's Flyweight": 'WFLW', "Women's Strawweight": 'WSW',
};

export interface OfficialEntry { division: string; pos: number; interim: boolean; name: string }
export interface OfficialRankings { released: string | null; entries: OfficialEntry[] }

export async function fetchOfficialRankings(offline: boolean): Promise<OfficialRankings> {
  let text = '';
  if (!offline) {
    try {
      const res = await fetch(URL_RAW, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'DadosUFC/1.0 (projeto pessoal)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      await writeFile(CACHE, text);
    } catch (e) {
      console.warn(`  ! Ranking oficial indisponível (${(e as Error).message}); usando cache se existir.`);
    }
  }
  if (!text) {
    try { text = await readFile(CACHE, 'utf8'); } catch { /* sem cache */ }
  }
  return parseRankings(text);
}

export function parseRankings(text: string): OfficialRankings {
  const start = text.search(/==\s*Men's Meta rankings\s*==/);
  const end = text.search(/==\s*Men's media rankings\s*==/);
  if (start < 0 || end < 0) return { released: null, entries: [] };
  const body = text.slice(start, end);
  const entries: OfficialEntry[] = [];
  let released: string | null = null;
  for (const sec of body.split(/\n===\s*/).slice(1)) {
    const title = sec.slice(0, sec.indexOf('===')).trim();
    const division = DIVISIONS[title];
    if (!division) continue;
    const rel = /Rankings released on ([A-Za-z]+ \d+, \d{4})/.exec(sec)?.[1];
    if (!released && rel && !Number.isNaN(Date.parse(rel + ' UTC'))) released = new Date(rel + ' UTC').toISOString().slice(0, 10); // AAAA-MM-DD
    const table = sec.slice(sec.indexOf('{|'), sec.indexOf('\n|}'));
    for (const row of table.split('\n|-')) {
      const lines = row.split('\n').map((l) => l.trim());
      const head = lines.find((l) => l.startsWith('!'));
      if (!head) continue;
      const tip = /Tooltip\|(IC|C)\|/.exec(head)?.[1];
      const num = /^!\s*(?:style="[^"]*"\s*\|\s*)?(\d+)\s*$/.exec(head)?.[1];
      if (!tip && !num) continue;
      // 1ª célula = bandeira; 2ª = lutador (com link, {{sortname}} ou texto simples)
      const cells = lines.filter((l) => l.startsWith('|') && !l.startsWith('|-') && !l.startsWith('|}'));
      const cell = (cells[1] ?? '').replace(/^\|\s*/, '');
      const link = /\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(cell)?.[1];
      const sort = /\{\{sortname\|([^|}]*)\|([^|}]*)/i.exec(cell);
      const plain = cell.replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]*>/g, '').replace(/'+/g, '').trim();
      const name = link ?? (sort ? `${sort[1]} ${sort[2]}` : plain);
      if (!name) continue;
      entries.push({ division, pos: tip ? 0 : Number(num), interim: tip === 'IC', name: name.trim() });
    }
  }
  return { released, entries };
}
