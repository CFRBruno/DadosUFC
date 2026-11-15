// Download das fontes de dados.
//
// 1) Lutas concluídas: espelho em CSV do UFCStats mantido no GitHub
//    (Greco1899/scrape_ufc_stats, atualizado diariamente). Contém TODAS as lutas
//    do UFC com estatísticas round a round.
// 2) Próximos eventos: página "upcoming" do próprio UFCStats (HTTP).

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

export const RAW_DIR = path.resolve('data/raw');
const MIRROR = 'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main';
export const CSV_FILES = [
  'ufc_event_details',
  'ufc_fight_results',
  'ufc_fight_stats',
  'ufc_fighter_details',
  'ufc_fighter_tott',
] as const;

const UA = 'Mozilla/5.0 (compatible; DadosUFC/0.1; uso pessoal)';

async function get(url: string, tries = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchMirror(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  for (const f of CSV_FILES) {
    const txt = await get(`${MIRROR}/${f}.csv`);
    await writeFile(path.join(RAW_DIR, `${f}.csv`), txt);
    console.log(`  ✓ ${f}.csv (${(txt.length / 1024).toFixed(0)} KB)`);
  }
}

export async function readRaw(name: string): Promise<string> {
  return readFile(path.join(RAW_DIR, name), 'utf8');
}

export async function rawExists(name: string): Promise<boolean> {
  try {
    await stat(path.join(RAW_DIR, name));
    return true;
  } catch {
    return false;
  }
}

// --- Próximos eventos ----------------------------------------------------------

export interface ScrapedBout {
  a: { name: string; ufcstatsId: string | null };
  b: { name: string; ufcstatsId: string | null };
  weightClass: string;
}
export interface ScrapedEvent {
  id: string;
  name: string;
  date: string | null; // ISO
  location: string;
  bouts: ScrapedBout[];
}

const idFromUrl = (u: string | undefined) => (u ? (u.match(/([0-9a-f]{16})\/?$/)?.[1] ?? null) : null);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function toIsoDate(s: string): string | null {
  const t = Date.parse(clean(s) + ' UTC');
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export async function fetchUpcoming(): Promise<ScrapedEvent[]> {
  const html = await get('http://ufcstats.com/statistics/events/upcoming?page=all');
  const $ = cheerio.load(html);
  const list: { url: string; name: string; date: string | null; location: string }[] = [];
  $('tr.b-statistics__table-row').each((_, tr) => {
    const a = $(tr).find('a.b-link').first();
    const url = a.attr('href');
    if (!url) return;
    list.push({
      url,
      name: clean(a.text()),
      date: toIsoDate($(tr).find('span.b-statistics__date').text()),
      location: clean($(tr).find('td').eq(1).text()),
    });
  });

  const events: ScrapedEvent[] = [];
  for (const ev of list) {
    const page = cheerio.load(await get(ev.url));
    const bouts: ScrapedBout[] = [];
    page('tr.b-fight-details__table-row').each((_, tr) => {
      const links = page(tr).find('td').eq(1).find('a.b-link');
      if (links.length < 2) return;
      const la = page(links[0]);
      const lb = page(links[1]);
      bouts.push({
        a: { name: clean(la.text()), ufcstatsId: idFromUrl(la.attr('href')) },
        b: { name: clean(lb.text()), ufcstatsId: idFromUrl(lb.attr('href')) },
        weightClass: clean(page(tr).find('td').eq(6).text()),
      });
    });
    events.push({ id: idFromUrl(ev.url) ?? ev.url, name: ev.name, date: ev.date, location: ev.location, bouts });
    console.log(`  ✓ ${ev.name}: ${bouts.length} lutas`);
    await new Promise((r) => setTimeout(r, 400));
  }
  return events;
}
