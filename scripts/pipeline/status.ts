// Aposentadorias e dispensas do UFC. A Wikipédia mantém a tabela "Recent releases and retirements"
// (só o último mês, com data e motivo). Cada execução soma o que encontrar a data/status/archive.json,
// que é versionado: o histórico cresce a cada atualização diária.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RAW_DIR } from './fetch';

export const STATUS_FILE = 'data/status/archive.json';
const CACHE = path.join(RAW_DIR, 'wikipedia-ufc-current.txt');
const URL_RAW = 'https://en.wikipedia.org/w/index.php?title=List_of_current_UFC_fighters&action=raw';
const MON: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

export interface StatusEntry { d: string; n: string; kind: 'aposentado' | 'dispensado' | 'outro'; reason: string; div: string }
export type StatusArchive = Record<string, StatusEntry>;

export async function loadStatus(): Promise<StatusArchive> {
  try { return JSON.parse(await readFile(STATUS_FILE, 'utf8')); } catch { return {}; }
}

export function parseStatus(text: string): StatusEntry[] {
  const i = text.search(/==\s*Recent releases and retirements\s*==/);
  if (i < 0) return [];
  const rest = text.slice(i);
  const end = rest.search(/\n==\s*Recent signings/);
  const table = rest.slice(rest.indexOf('{|'), end > 0 ? end : undefined);
  const out: StatusEntry[] = [];
  for (const row of table.split('\n|-')) {
    const lines = row.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && !l.startsWith('|}'));
    const dts = /\{\{dts\|(\d{4})\|(\w{3})\|(\d{1,2})/.exec(row);
    if (!dts || !MON[dts[2]]) continue;
    const d = `${dts[1]}-${MON[dts[2]]}-${dts[3].padStart(2, '0')}`;
    const sn = /\{\{sortname\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?/i.exec(row);
    const link = lines.map((l) => /\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(l)?.[1]).find((x) => x && !/^flag/i.test(x));
    const n = sn ? `${sn[1]} ${sn[2]}`.trim() : link;
    // colunas: data | país | nome | apelido | motivo | categoria | ref | ...
    const cells = lines.map((l) => l.replace(/^\|\s*/, ''));
    const reasonCell = cells.find((c) => /^(retired|released|retire|release|.*(?:retire|releas|cut|contract|departed|leaves|left).*)$/i.test(c.replace(/<[^>]*>|\{\{[^}]*\}\}|\[\[|\]\]|'+/g, '').trim()) && !/^\{\{dts/.test(c));
    if (!n || !reasonCell) continue;
    const reason = reasonCell.replace(/<[^>]*>|\{\{[^}]*\}\}|\[\[|\]\]|'+/g, '').trim();
    const kind: StatusEntry['kind'] = /retire/i.test(reason) ? 'aposentado' : /releas|cut|contract/i.test(reason) ? 'dispensado' : 'outro';
    const div = cells.find((c) => /weight|strawweight/i.test(c) && !/\{\{ntsh/.test(c))?.replace(/\[\[|\]\]|<[^>]*>/g, '').trim() ?? '';
    out.push({ d, n, kind, reason, div });
  }
  return out;
}

export async function updateStatus(arch: StatusArchive, offline: boolean): Promise<void> {
  let text = '';
  if (!offline) {
    try {
      const res = await fetch(URL_RAW, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'DadosUFC/1.0 (projeto pessoal)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      await writeFile(CACHE, text);
    } catch (e) { console.warn(`  ! Aposentadorias e dispensas indisponíveis (${(e as Error).message}).`); }
  }
  if (!text) { try { text = await readFile(CACHE, 'utf8'); } catch { /* sem cache */ } }
  const found = parseStatus(text);
  let added = 0;
  for (const e of found) { const k = `${e.d}|${e.n}`; if (!arch[k]) added++; arch[k] = e; }
  if (added) {
    const items = Object.entries(arch).sort((x, y) => y[1].d.localeCompare(x[1].d) || x[0].localeCompare(y[0]));
    await writeFile(STATUS_FILE, '{\n' + items.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}\n');
  }
  console.log(`  ✓ Aposentadorias e dispensas: ${found.length} na tabela atual (${added} novas); arquivo com ${Object.keys(arch).length}`);
}
