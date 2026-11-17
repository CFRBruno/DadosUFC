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
export interface OfficialRankings { released: string | null; entries: OfficialEntry[]; p4p: P4PRankings }

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
  const p4p = parseP4P(text);
  if (start < 0 || end < 0) return { released: null, entries: [], p4p };
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
  return { released, entries, p4p };
}

export interface P4PEntry { pos: number; name: string; division: string | null }
export interface P4PRankings { released: string | null; men: P4PEntry[]; women: P4PEntry[] }

/** Pound-for-pound (painel de mídia, ainda publicado no período de transição para o Meta UFC Rankings). */
export function parseP4P(text: string): P4PRankings {
  const grab = (heading: RegExp): { rows: P4PEntry[]; released: string | null } => {
    const m = heading.exec(text);
    if (!m) return { rows: [], released: null };
    const rest = text.slice(m.index + m[0].length);
    const end = rest.search(/\n===?\s*[A-Z]/);
    const sec = end > 0 ? rest.slice(0, end) : rest;
    const released = /Rankings released on ([A-Za-z]+ \d+, \d{4})/.exec(sec)?.[1];
    const table = sec.slice(sec.indexOf('{|'), sec.indexOf('\n|}'));
    const rows: P4PEntry[] = [];
    for (const row of table.split('\n|-')) {
      const lines = row.split('\n').map((l) => l.trim());
      const num = lines.map((l) => /^!\s*(\d+)\s*$/.exec(l)?.[1]).find(Boolean);
      if (!num) continue;
      const cells = lines.filter((l) => l.startsWith('|') && !l.startsWith('|-') && !l.startsWith('|}')).map((l) => l.replace(/^\|\s*/, ''));
      const nameCell = cells[1] ?? '';
      const name = /\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(nameCell)?.[1] ?? /\{\{sortname\|([^|}]*)\|([^|}]*)/i.exec(nameCell)?.slice(1, 3).join(' ') ?? nameCell.replace(/\{\{[^}]*\}\}|<[^>]*>|'+/g, '').trim();
      const wc = cells.map((c) => /\[\[[^\]|]*\(MMA\)\|([^\]]+)\]\]/.exec(c)?.[1]).find(Boolean) ?? null;
      if (name) rows.push({ pos: Number(num), name: name.trim(), division: wc });
    }
    return { rows, released: released && !Number.isNaN(Date.parse(released + ' UTC')) ? new Date(released + ' UTC').toISOString().slice(0, 10) : null };
  };
  const men = grab(/===\s*Men's pound-for-pound\s*===/);
  const women = grab(/===\s*Women's pound-for-pound\s*===/);
  return { released: men.released ?? women.released, men: men.rows, women: women.rows };
}
