// Histórico dos cinturões por categoria (+ BMF) para a linha do tempo.
// Lutas valendo cinturão (linear e interino) da base + notas curadas
// (vacâncias, promoções, motivos dos interinos) de data/manual/title-notes.json.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { S, type StatLine } from '../../src/shared/types';
import type { TitleHistory, TitleChapter, TitleNote } from '../../src/shared/titleTypes';
import { RAW_DIR } from './fetch';
import type { RawFight } from './load';

const MAIN = ['FLW', 'BW', 'FW', 'LW', 'WW', 'MW', 'LHW', 'HW', 'WSW', 'WFLW', 'WBW', 'WFW'] as const;
const NAMES: Record<string, string> = {
  FLW: 'Peso-Mosca', BW: 'Peso-Galo', FW: 'Peso-Pena', LW: 'Peso-Leve', WW: 'Peso Meio-Médio', MW: 'Peso-Médio',
  LHW: 'Peso Meio-Pesado', HW: 'Peso-Pesado', WSW: 'Peso-Palha Feminino', WFLW: 'Peso-Mosca Feminino',
  WBW: 'Peso-Galo Feminino', WFW: 'Peso-Pena Feminino', BMF: 'BMF',
};
const PHOTO_CACHE = path.join(RAW_DIR, 'cache-title-photos.json');

interface Notes {
  events: (TitleNote & { division: string })[];
  inauguralTournament: { division: string; date: string }[];
  interimReasons: Record<string, { source: 'wiki' | 'dados'; text: string }>;
  bmf: { fights: { date: string; winner: string; loser: string }[]; upcoming: { event: string; a: string; b: string }[] };
}

const line = (l: StatLine | undefined | null) =>
  l ? { sig: l[S.sigL], sigA: l[S.sigA], td: l[S.tdL], tdA: l[S.tdA], ctrl: l[S.ctrl], sub: l[S.sub], kd: l[S.kd] } : null;

export async function buildTitleHistory(opts: {
  fights: RawFight[];
  slugOf: (id: string) => string | null;
  photoById: Map<string, string>;
  /** reserva: foto com licença livre (Wikimedia) por nome */
  wikiPhoto: (name: string) => string | null;
  offline: boolean;
}): Promise<{ history: TitleHistory; missingPhotos: string[] }> {
  const notes: Notes = JSON.parse(await readFile('data/manual/title-notes.json', 'utf8'));
  let manualPhotos: Record<string, string> = {};
  try {
    manualPhotos = JSON.parse(await readFile('data/manual/photos.json', 'utf8')).photos ?? {};
  } catch {
    /* sem arquivo */
  }

  const toChapter = (f: RawFight, extra: Partial<TitleChapter> = {}): TitleChapter => {
    const wi = f.winner;
    const [ia, ib] = wi === 1 ? [1, 0] : [0, 1];
    return {
      kind: 'fight', id: f.id, date: f.date, event: f.event, interim: f.interim, rounds: f.scheduledRounds,
      result: f.outcome, method: f.method, decision: f.decision, detail: f.detail,
      round: f.endRound, time: f.endTime, sec: f.durationSec,
      a: { id: f.fighters[ia].id, name: f.fighters[ia].name, slug: opts.slugOf(f.fighters[ia].id) },
      b: { id: f.fighters[ib].id, name: f.fighters[ib].name, slug: opts.slugOf(f.fighters[ib].id) },
      winnerIsA: wi != null,
      sa: line(f.stats?.[ia]), sb: line(f.stats?.[ib]),
      ...extra,
    };
  };

  const divisions: TitleHistory['divisions'] = {};
  for (const k of MAIN) {
    const inaug = new Set(notes.inauguralTournament.filter((x) => x.division === k).map((x) => x.date));
    const fs = opts.fights.filter((f) => f.division === k && ((f.title && !f.tournament) || (f.tournament && inaug.has(f.date))));
    divisions[k] = {
      name: NAMES[k],
      women: k.startsWith('W') && k !== 'WW',
      chapters: fs.map((f) => toChapter(f, f.interim ? { interimReason: notes.interimReasons[`${k}|${f.date}`] ?? null } : {})),
      notes: notes.events.filter((e) => e.division === k).map(({ division: _d, ...e }) => e),
      upcoming: [],
    };
  }

  // BMF: lutas identificadas por data + nomes
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const bmfChapters: TitleChapter[] = [];
  for (const b of notes.bmf.fights) {
    const f = opts.fights.find(
      (x) => x.date === b.date && x.fighters.some((p) => norm(p.name) === norm(b.winner)) && x.fighters.some((p) => norm(p.name) === norm(b.loser)),
    );
    if (f) bmfChapters.push(toChapter(f, { interim: false }));
    else console.warn(`  ! BMF: luta não encontrada (${b.date} ${b.winner} × ${b.loser})`);
  }
  divisions.BMF = {
    name: 'BMF', women: false, chapters: bmfChapters,
    notes: notes.events.filter((e) => e.division === 'BMF').map(({ division: _d, ...e }) => e),
    upcoming: notes.bmf.upcoming,
  };

  // fotos: base do site (ESPN/Wikimedia) → manual → busca ESPN por nome (com cache)
  const names = new Map<string, string | null>(); // nome → id
  for (const d of Object.values(divisions)) {
    for (const c of d.chapters) {
      if (c.kind !== 'fight') continue;
      names.set(c.a.name, c.a.id);
      names.set(c.b.name, c.b.id);
    }
    for (const n of d.notes) {
      if (!names.has(n.who)) names.set(n.who, null);
      if (n.promote && !names.has(n.promote)) names.set(n.promote, null);
    }
  }
  let cache: Record<string, { url: string | null; at: string }> = {};
  try {
    cache = JSON.parse(await readFile(PHOTO_CACHE, 'utf8'));
  } catch {
    /* vazio */
  }
  const today = new Date().toISOString().slice(0, 10);
  const photos: Record<string, string> = {};
  const idByName = new Map([...names.entries()].filter(([, id]) => id) as [string, string][]);
  let searched = 0;
  for (const [name, id] of names) {
    const fromSite = (id && opts.photoById.get(id)) || (idByName.get(name) && opts.photoById.get(idByName.get(name)!));
    if (manualPhotos[name]) photos[name] = manualPhotos[name];
    else if (fromSite) photos[name] = fromSite;
    else {
      const c = cache[name];
      const stale = !c || (!c.url && (Date.parse(today) - Date.parse(c.at)) / 864e5 > 30);
      if (stale && !opts.offline) {
        cache[name] = { url: await espnSearch(name), at: today };
        searched++;
      }
      if (cache[name]?.url) photos[name] = cache[name].url!;
      else {
        const w = opts.wikiPhoto(name);
        if (w) photos[name] = w;
      }
    }
  }
  if (searched) await writeFile(PHOTO_CACHE, JSON.stringify(cache));
  const missingPhotos = [...names.keys()].filter((n) => !photos[n]).sort();
  return { history: { generatedAt: new Date().toISOString(), divisions, photos }, missingPhotos };
}

async function espnSearch(name: string): Promise<string | null> {
  try {
    const r = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=5&type=player`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { contents?: { displayName: string; sport?: string; image?: { default?: string } }[] }[] };
    const want = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const res of j.results ?? [])
      for (const c of res.contents ?? []) {
        const got = c.displayName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const id = c.image?.default?.match(/full\/(\d+)\.png/)?.[1];
        if (c.sport === 'mma' && got === want && id)
          return `https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${id}.png&w=700&h=508`;
      }
  } catch {
    /* sem foto */
  }
  return null;
}
