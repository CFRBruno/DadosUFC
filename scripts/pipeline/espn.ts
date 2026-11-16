// ESPN: fotos (headshots), país dos atletas e calendário de eventos (inclusive futuros).
// API pública e não oficial; as fotos têm direitos autorais da ESPN — uso pessoal.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScrapedEvent } from './fetch';
import { RAW_DIR } from './fetch';

const SB_CACHE = path.join(RAW_DIR, 'espn-scoreboard.json');
const HS_CACHE = path.join(RAW_DIR, 'espn-headshots.json');

interface EspnCompetitor { id: string; winner?: boolean; athlete: { displayName: string; flag?: { href: string; alt: string } } }
interface EspnCompetition { id?: string; date: string; type?: { abbreviation: string }; format?: { regulation?: { periods?: number } }; competitors: EspnCompetitor[] }
interface EspnEvent {
  id: string; name: string; date: string;
  status: { type: { name: string } };
  venues?: { fullName?: string; address?: { city?: string; state?: string; country?: string } }[];
  competitions: EspnCompetition[];
}

export interface EspnAthlete { id: string; name: string; country: string; flag: string }
export interface EspnData {
  events: EspnEvent[];
  athletes: Map<string, EspnAthlete>;
}

export async function fetchEspn(offline: boolean, fromYear: number): Promise<EspnData> {
  let events: EspnEvent[] = [];
  if (!offline) {
    try {
      // a API aceita no máximo um ano por consulta
      const lastYear = new Date().getUTCFullYear() + 1;
      for (let y = fromYear; y <= lastYear; y++) {
        const url = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${y}0101-${y}1231&limit=400`;
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        events.push(...(((await res.json()) as { events: EspnEvent[] }).events ?? []));
      }
      await writeFile(SB_CACHE, JSON.stringify(events));
      console.log(`  ✓ ESPN: ${events.length} eventos`);
    } catch (e) {
      console.warn(`  ! ESPN indisponível (${(e as Error).message}); usando cache se existir.`);
    }
  }
  if (!events.length) {
    try {
      events = JSON.parse(await readFile(SB_CACHE, 'utf8'));
    } catch {
      /* sem cache */
    }
  }
  const athletes = new Map<string, EspnAthlete>();
  for (const e of events)
    for (const c of e.competitions)
      for (const k of c.competitors)
        {
        // sem nacionalidade cadastrada, a ESPN devolve alt "default" e uma bandeira em branco
        const fl = k.athlete.flag;
        const blank = !fl?.alt || fl.alt.toLowerCase() === 'default' || /blank/i.test(fl.href ?? '');
        athletes.set(k.id, { id: k.id, name: k.athlete.displayName, country: blank ? '' : fl!.alt, flag: blank ? '' : smallFlag(fl!.href) });
      }
  return { events, athletes };
}

// --- Próximos eventos --------------------------------------------------------------

const WC: Record<string, string> = {
  'W Strawweight': "Women's Strawweight", 'W Flyweight': "Women's Flyweight",
  'W Bantamweight': "Women's Bantamweight", 'W Featherweight': "Women's Featherweight",
  Catchweight: 'Catch Weight', 'Catch Weight': 'Catch Weight',
};

/** Converte eventos agendados da ESPN no mesmo formato do coletor do UFCStats. */
export function espnUpcoming(data: EspnData, today: string): ScrapedEvent[] {
  return data.events
    .filter((e) => e.status.type.name !== 'STATUS_FINAL' && e.date.slice(0, 10) >= today)
    .map((e) => {
      const v = e.venues?.[0];
      const loc = [v?.address?.city, v?.address?.state, v?.address?.country].filter(Boolean).join(', ');
      // a ESPN lista do primeiro combate da noite até a luta principal → invertemos
      const isTba = (n?: string) => !n || /\b(tba|tbd)\b|^opponent/i.test(n);
      const comps = [...e.competitions]
        .reverse()
        .filter((c) => c.competitors.length === 2 && !c.competitors.some((k) => isTba(k.athlete.displayName)));
      return {
        id: 'espn-' + e.id,
        name: e.name,
        date: e.date.slice(0, 10),
        location: loc,
        bouts: comps.map((c) => {
          const abbr = c.type?.abbreviation ?? '';
          const periods = c.format?.regulation?.periods ?? 3;
          return {
            a: { name: c.competitors[0]?.athlete.displayName ?? '?', ufcstatsId: null, espnId: c.competitors[0]?.id },
            b: { name: c.competitors[1]?.athlete.displayName ?? '?', ufcstatsId: null, espnId: c.competitors[1]?.id },
            weightClass: (WC[abbr] ?? abbr) + ' Bout',
            rounds: periods,
          };
        }),
      } as ScrapedEvent;
    });
}

// --- Casamento ESPN ↔ UFCStats ------------------------------------------------------------

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Descobre o id ESPN de cada lutador do site: primeiro pelo nome; depois, para
 * grafias diferentes, pela luta (mesma data e adversário já identificado).
 */
export function matchEspnIds(
  data: EspnData,
  fighters: { id: string; name: string }[],
  fightsOnDate: (date: string) => [string, string][],
): Map<string, string> {
  const out = new Map<string, string>(); // nosso id → espn id
  const byName = new Map<string, string[]>();
  for (const a of data.athletes.values()) {
    const k = norm(a.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(a.id);
  }
  const ours = new Map(fighters.map((f) => [f.id, f]));
  for (const f of fighters) {
    const c = byName.get(norm(f.name));
    if (c?.length === 1) out.set(f.id, c[0]);
  }
  const taken = new Set(out.values());
  // pela luta
  for (const e of data.events) {
    for (const c of e.competitions) {
      if (c.competitors.length < 2) continue;
      const d = c.date.slice(0, 10);
      const prev = new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
      const pairs = [...fightsOnDate(d), ...fightsOnDate(prev)];
      const [x, y] = c.competitors;
      for (const [k1, k2] of [[x, y], [y, x]]) {
        if (taken.has(k1.id)) {
          const mine = [...out.entries()].find(([, v]) => v === k1.id)?.[0];
          const pair = pairs.find((p) => p.includes(mine ?? '§'));
          const other = pair ? (pair[0] === mine ? pair[1] : pair[0]) : null;
          if (other && !out.has(other) && !taken.has(k2.id) && ours.has(other)) {
            out.set(other, k2.id);
            taken.add(k2.id);
          }
        }
      }
    }
  }
  return out;
}

// --- Fotos ------------------------------------------------------------------------------------

export const espnHeadshot = (id: string) =>
  `https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${id}.png&w=240&h=174`;
export const espnPage = (id: string) => `https://www.espn.com/mma/fighter/_/id/${id}`;

/** Verifica (com cache) quais atletas têm foto na ESPN. */
export async function checkHeadshots(ids: string[], offline: boolean): Promise<Set<string>> {
  let cache: Record<string, { ok: boolean; at: string }> = {};
  try {
    cache = JSON.parse(await readFile(HS_CACHE, 'utf8'));
  } catch {
    /* vazio */
  }
  const now = new Date().toISOString().slice(0, 10);
  const stale = (c?: { ok: boolean; at: string }) =>
    !c || (!c.ok && (Date.parse(now) - Date.parse(c.at)) / 864e5 > 14);
  const todo = offline ? [] : ids.filter((id) => stale(cache[id]));
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const id = todo[i++];
      try {
        const r = await fetch(`https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
        cache[id] = { ok: r.ok, at: now };
      } catch {
        /* tenta de novo na próxima execução */
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (todo.length) {
    await writeFile(HS_CACHE, JSON.stringify(cache));
    console.log(`  ✓ ${todo.length} fotos verificadas na ESPN`);
  }
  return new Set(Object.entries(cache).filter(([, v]) => v.ok).map(([k]) => k));
}

// países (ESPN, em inglês) → pt-BR
const COUNTRY_PT: Record<string, string> = {
  USA: 'Estados Unidos', 'United States': 'Estados Unidos', Brazil: 'Brasil', Russia: 'Rússia', Mexico: 'México',
  England: 'Inglaterra', 'United Kingdom': 'Reino Unido', Scotland: 'Escócia', Wales: 'País de Gales', Ireland: 'Irlanda',
  France: 'França', Germany: 'Alemanha', Poland: 'Polônia', Australia: 'Austrália', 'New Zealand': 'Nova Zelândia',
  Canada: 'Canadá', China: 'China', Japan: 'Japão', 'South Korea': 'Coreia do Sul', Kazakhstan: 'Cazaquistão',
  Kyrgyzstan: 'Quirguistão', Uzbekistan: 'Uzbequistão', Tajikistan: 'Tajiquistão', Georgia: 'Geórgia', Armenia: 'Armênia',
  Azerbaijan: 'Azerbaijão', Ukraine: 'Ucrânia', Belarus: 'Belarus', Lithuania: 'Lituânia', Latvia: 'Letônia',
  Moldova: 'Moldávia', Romania: 'Romênia', Serbia: 'Sérvia', Croatia: 'Croácia', Bosnia: 'Bósnia', Slovakia: 'Eslováquia',
  'Czech Republic': 'República Tcheca', Czechia: 'Tchéquia', Netherlands: 'Holanda', Belgium: 'Bélgica', Sweden: 'Suécia',
  Norway: 'Noruega', Denmark: 'Dinamarca', Finland: 'Finlândia', Iceland: 'Islândia', Switzerland: 'Suíça', Austria: 'Áustria',
  Italy: 'Itália', Spain: 'Espanha', Portugal: 'Portugal', Greece: 'Grécia', Turkey: 'Turquia', Israel: 'Israel',
  Iran: 'Irã', Iraq: 'Iraque', 'Saudi Arabia': 'Arábia Saudita', 'United Arab Emirates': 'Emirados Árabes', Bahrain: 'Barein',
  Afghanistan: 'Afeganistão', India: 'Índia', Thailand: 'Tailândia', Philippines: 'Filipinas', Indonesia: 'Indonésia',
  Myanmar: 'Mianmar', Mongolia: 'Mongólia', 'South Africa': 'África do Sul', Nigeria: 'Nigéria', Cameroon: 'Camarões',
  Congo: 'Congo', 'DR Congo': 'RD Congo', Morocco: 'Marrocos', Tunisia: 'Tunísia', Egypt: 'Egito', Ghana: 'Gana',
  Argentina: 'Argentina', Chile: 'Chile', Peru: 'Peru', Colombia: 'Colômbia', Venezuela: 'Venezuela', Ecuador: 'Equador',
  Uruguay: 'Uruguai', Paraguay: 'Paraguai', Bolivia: 'Bolívia', Cuba: 'Cuba', 'Dominican Republic': 'República Dominicana',
  Jamaica: 'Jamaica', 'Puerto Rico': 'Porto Rico', Panama: 'Panamá', 'Costa Rica': 'Costa Rica', Guatemala: 'Guatemala',
  Dagestan: 'Daguestão', Chechnya: 'Chechênia', Bulgaria: 'Bulgária', Hungary: 'Hungria', Slovenia: 'Eslovênia',
  Albania: 'Albânia', Kosovo: 'Kosovo', 'North Macedonia': 'Macedônia do Norte', Montenegro: 'Montenegro', Estonia: 'Estônia',
  Vietnam: 'Vietnã', Taiwan: 'Taiwan', Singapore: 'Singapura', Malaysia: 'Malásia', Pakistan: 'Paquistão', Jordan: 'Jordânia',
  Lebanon: 'Líbano', Syria: 'Síria', Palestine: 'Palestina', Algeria: 'Argélia', Senegal: 'Senegal', Angola: 'Angola',
  'Ivory Coast': 'Costa do Marfim', Zimbabwe: 'Zimbábue', Kenya: 'Quênia', Uganda: 'Uganda', Guam: 'Guam', Samoa: 'Samoa',
  Tonga: 'Tonga', Fiji: 'Fiji', Haiti: 'Haiti', Suriname: 'Suriname', Guyana: 'Guiana', Honduras: 'Honduras',
  'El Salvador': 'El Salvador', Nicaragua: 'Nicarágua', Tahiti: 'Taiti',
};
export const countryPt = (c: string) => COUNTRY_PT[c] ?? c;

/** Bandeira reduzida pelo redimensionador da ESPN (a original tem 500 px). */
function smallFlag(href: string): string {
  const m = href.match(/a\.espncdn\.com(\/i\/teamlogos\/countries\/500\/[a-z0-9]+\.png)/i);
  return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=40&h=40` : href;
}

// --- Fotos hospedadas no próprio site (para a imagem de compartilhamento) ----------------------------
// O CDN da ESPN não envia cabeçalho CORS: o navegador não deixa desenhar essas fotos num <canvas> e
// copiar o resultado. Por isso guardamos uma cópia pequena de cada foto (cache em data/raw/photos).

const PHOTO_DIR = path.join(RAW_DIR, 'photos');

export async function localPhotos(espnIds: string[], outDir: string, offline: boolean): Promise<Set<string>> {
  const { mkdir, copyFile, access } = await import('node:fs/promises');
  await mkdir(PHOTO_DIR, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const have = new Set<string>();
  const exists = async (f: string) => access(f).then(() => true, () => false);
  let i = 0, fetched = 0;
  const worker = async () => {
    while (i < espnIds.length) {
      const id = espnIds[i++];
      const cache = path.join(PHOTO_DIR, `${id}.png`);
      if (!(await exists(cache)) && !offline) {
        try {
          const res = await fetch(`https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${id}.png&w=180&h=131`, { signal: AbortSignal.timeout(30_000) });
          if (res.ok) { await writeFile(cache, Buffer.from(await res.arrayBuffer())); fetched++; }
        } catch { /* tenta na próxima execução */ }
      }
      if (await exists(cache)) { await copyFile(cache, path.join(outDir, `${id}.png`)); have.add(id); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (fetched) console.log(`  ✓ ${fetched} fotos novas guardadas para a imagem de compartilhamento`);
  return have;
}
