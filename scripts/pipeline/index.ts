// Pipeline de dados do DadosUFC.
//   npm run data            → baixa as fontes e gera public/data/
//   npm run data:offline    → usa os arquivos já baixados em data/raw/

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DIVISION_BY_KEY, MAIN_DIVISIONS, parseWeightClass, type DivisionKey } from '../../src/shared/divisions';
import type {
  RankingRow, TitleFight,
  EventInfo, FightEntry, FighterDetail, FighterSummary, MethodBreakdown, Meta, OfficialBoard, StatRank, TitleReign, UpcomingBout,
} from '../../src/shared/types';
import { S } from '../../src/shared/types';
import { emptyState } from '../../src/shared/model';
import type { ModelParams } from '../../src/shared/types';
import { computePriors, priorsFor, processChronologically } from './build';
import { buildFeatures, currentSnapshot } from './features';
import { loadOdds, marketLookup, updateOdds } from './odds';
import { trainModel2, type MethodInfo } from './train';
import { fetchMirror, fetchUpcoming, rawExists, RAW_DIR, type ScrapedEvent } from './fetch';
import { classifyStyle, computeForm, computePercentiles, computeRates, recentStreak, strengthsWeaknesses } from './insights';
import { loadDataset, type RawFight } from './load';
import { fetchWikiPhotos, photoMatcher } from './photos';
import { buildTitleHistory } from './titleHistory';
import { checkHeadshots, countryPt, espnHeadshot, espnPage, espnUpcoming, fetchEspn, matchEspnIds } from './espn';
import { fetchOfficialRankings } from './rankings';
import { buildStory } from '../../src/lib/titleStory';

/** Lutadores que lutaram no UFC a partir desta data entram no site. */
const SCOPE_FROM = '2026-01-01';
const OUT = path.resolve('public/data');
const offline = process.argv.includes('--offline');
const today = new Date().toISOString().slice(0, 10);

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const years = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (365.25 * 864e5);
const cm = (inches: number | null) => (inches ? Math.round(inches * 2.54) : null);

async function main() {
  console.log('▶ DadosUFC — pipeline de dados');

  // 1. Fontes ---------------------------------------------------------------
  if (!offline || !(await rawExists('ufc_fight_results.csv'))) {
    console.log('• Baixando lutas concluídas (espelho do UFCStats)…');
    await fetchMirror();
  }
  let upcoming: ScrapedEvent[] = [];
  let upcomingSource = 'nenhuma';
  if (!offline) {
    try {
      console.log('• Buscando próximos eventos no UFCStats…');
      upcoming = await fetchUpcoming();
      await writeFile(path.join(RAW_DIR, 'upcoming.json'), JSON.stringify(upcoming, null, 1));
      upcomingSource = 'UFCStats';
    } catch (e) {
      console.warn(`  ! Não foi possível acessar o UFCStats (${(e as Error).message}).`);
    }
  }
  if (!upcoming.length && (await rawExists('upcoming.json'))) {
    upcoming = JSON.parse(await readFile(path.join(RAW_DIR, 'upcoming.json'), 'utf8'));
    upcomingSource = 'UFCStats (cache)';
  }
  console.log('• Buscando calendário, fotos e países na ESPN…');
  const espn = await fetchEspn(offline, Number(SCOPE_FROM.slice(0, 4)));
  // linhas de mercado: insumo interno do modelo (o site não mostra odds)
  const oddsArchive = await loadOdds();
  await updateOdds(oddsArchive, espn, offline);
  const marketOf = marketLookup(oddsArchive);
  const officialRankings = await fetchOfficialRankings(offline);
  if (!upcoming.length) {
    upcoming = espnUpcoming(espn, today);
    if (upcoming.length) upcomingSource = 'ESPN';
  }
  const pairKey = (a: string, b: string) => [norm(a), norm(b)].sort().join('|');
  const knownPairs = new Set(upcoming.flatMap((u) => u.bouts.map((b) => pairKey(b.a.name, b.b.name))));
  try {
    const manual: ScrapedEvent[] = JSON.parse(await readFile('data/manual/upcoming.json', 'utf8')).events ?? [];
    for (const ev of manual) {
      const dup = upcoming.some((u) => norm(u.name) === norm(ev.name)) || ev.bouts.some((b) => knownPairs.has(pairKey(b.a.name, b.b.name)));
      if (!dup) {
        upcoming.push(ev);
        upcomingSource = upcomingSource === 'nenhuma' ? 'manual' : upcomingSource + ' + manual';
      }
    }
  } catch {
    /* sem arquivo manual */
  }

  // 2. Leitura e processamento ---------------------------------------------------
  console.log('• Lendo CSVs…');
  console.log('• Buscando fotos (Wikidata / Wikimedia Commons)…');
  const photoOf = photoMatcher(await fetchWikiPhotos(offline));
  const { bios, fights, events } = await loadDataset();
  console.log(`  ${fights.length} lutas, ${bios.size} lutadores, ${events.size} eventos`);
  const { priors, fiveRoundDecFactor } = computePriors(fights);
  console.log('• Calculando Elo e estados pré-luta…');
  const proc = processChronologically(fights, bios, priors, fiveRoundDecFactor);
  console.log('• Gerando variáveis pré-luta e treinando o modelo…');
  const feat = buildFeatures(fights, bios, priors);
  const methodInfo = new Map<string, MethodInfo>(proc.samples.map((x) => [x.id, x]));
  const trained = trainModel2(feat.samples, feat.samples.map((x) => marketOf(x.date, x.an, x.bn)), methodInfo);
  const model: ModelParams = { version: 2, v2: trained.v2, priors, fiveRoundDecFactor, metrics: trained.metrics };
  const m = model.metrics;
  const pc = (x: number) => (x * 100).toFixed(1) + '%';
  console.log(
    `  Avaliação ano a ano — só estatísticas desde ${m.stats.from.slice(0, 4)} (${m.stats.n} lutas): ${pc(m.stats.accuracy)}, log-loss ${m.stats.logLoss.toFixed(4)}\n` +
      `  ${m.usesMarket ? 'Com mercado' : 'Principal'} desde ${m.testFrom.slice(0, 4)} (${m.testN} lutas): ${pc(m.accuracy)}, log-loss ${m.logLoss.toFixed(4)}` +
      ` · só estatísticas nas mesmas lutas ${pc(m.statsSame.accuracy)}` + (m.marketOnly ? ` · mercado sozinho ${pc(m.marketOnly.accuracy)} (${m.marketOnly.logLoss.toFixed(4)})` : '') + '\n' +
      `  Desde ${m.recent.from.slice(0, 4)} (${m.recent.n} lutas): ${pc(m.recent.accuracy)} (só estatísticas ${pc(m.recent.statsAccuracy)}) · só Elo ${pc(m.eloOnlyAccuracy)} · ` +
      `método ${pc(m.methodAccuracy)} · exato ${pc(m.exactAccuracy)} · pesos mercado/estatísticas ${model.v2.market ? model.v2.market.a.toFixed(3) + ' / ' + model.v2.market.b.toFixed(3) : '—'}`,
  );

  // 3. Escopo ------------------------------------------------------------------------
  const fightsBy = new Map<string, RawFight[]>();
  for (const f of fights) {
    for (const s of f.fighters) {
      if (!fightsBy.has(s.id)) fightsBy.set(s.id, []);
      fightsBy.get(s.id)!.push(f);
    }
  }
  const lastDivision = (id: string): DivisionKey => {
    const fs = fightsBy.get(id) ?? [];
    for (let i = fs.length - 1; i >= 0; i--) if (fs[i].division !== 'CW' && fs[i].division !== 'OPEN') return fs[i].division;
    return fs.length ? fs[fs.length - 1].division : 'OPEN';
  };

  // nome → id (prefere quem lutou mais recentemente)
  const idByName = new Map<string, string>();
  for (const f of fights) for (const s of f.fighters) idByName.set(norm(s.name), s.id);
  for (const b of bios.values()) if (!idByName.has(norm(b.name))) idByName.set(norm(b.name), b.id);

  // ESPN ↔ nossos ids (lutadores ativos desde 2024)
  const fightsByDate = new Map<string, [string, string][]>();
  for (const f of fights) {
    if (!fightsByDate.has(f.date)) fightsByDate.set(f.date, []);
    fightsByDate.get(f.date)!.push([f.fighters[0].id, f.fighters[1].id]);
  }
  const active = [...fightsBy.entries()].filter(([, fs]) => fs[fs.length - 1].date >= '2024-01-01').map(([id]) => ({ id, name: bios.get(id)?.name ?? id }));
  const espnOf = matchEspnIds(espn, active, (d) => fightsByDate.get(d) ?? []);
  const ourOfEspn = new Map([...espnOf.entries()].map(([k, v]) => [v, k]));

  const scope = new Set<string>();
  for (const f of fights) if (f.date >= SCOPE_FROM) f.fighters.forEach((s) => scope.add(s.id));

  // próximos eventos
  const upcomingEvents: EventInfo[] = [];
  const nextBout = new Map<string, UpcomingBout>();
  const resolveUp = (p: { name: string; ufcstatsId: string | null; espnId?: string }) => {
    if (p.ufcstatsId && (fightsBy.has(p.ufcstatsId) || bios.has(p.ufcstatsId))) return p.ufcstatsId;
    if (p.espnId && ourOfEspn.has(p.espnId)) return ourOfEspn.get(p.espnId)!;
    return idByName.get(norm(p.name)) ?? (p.ufcstatsId || 'x' + norm(p.name));
  };
  const debutants = new Map<string, string>();
  for (const ev of upcoming.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))) {
    if (ev.date && ev.date < today) continue;
    const bouts: UpcomingBout[] = [];
    for (const [order, bt] of ev.bouts.entries()) {
      const wc = parseWeightClass(bt.weightClass || '');
      const ia = resolveUp(bt.a);
      const ib = resolveUp(bt.b);
      if (bt.a.espnId && !espnOf.has(ia)) espnOf.set(ia, bt.a.espnId);
      if (bt.b.espnId && !espnOf.has(ib)) espnOf.set(ib, bt.b.espnId);
      for (const [id, nm] of [[ia, bt.a.name], [ib, bt.b.name]]) {
        scope.add(id);
        if (!fightsBy.has(id)) debutants.set(id, nm);
      }
      const bout: UpcomingBout = {
        eventId: ev.id, event: ev.name, date: ev.date, division: wc.division, title: wc.title,
        rounds: bt.rounds ?? (order === 0 || wc.title ? 5 : 3), order,
        a: { id: ia, name: bt.a.name, slug: null },
        b: { id: ib, name: bt.b.name, slug: null },
      };
      const mk = marketOf(ev.date, bt.a.name, bt.b.name);
      if (mk != null) bout.mk = mk;
      bouts.push(bout);
      if (!nextBout.has(ia)) nextBout.set(ia, bout);
      if (!nextBout.has(ib)) nextBout.set(ib, bout);
    }
    upcomingEvents.push({ id: ev.id, name: ev.name, date: ev.date, location: ev.location, upcoming: true, fights: [], bouts, source: (ev as { source?: string }).source });
  }

  // slugs
  const slugOf = new Map<string, string>();
  const used = new Map<string, number>();
  const nameOf = (id: string) => bios.get(id)?.name || debutants.get(id) || id;
  for (const id of [...scope].sort()) {
    const base = slugify(nameOf(id)) || id;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    slugOf.set(id, n === 0 ? base : `${base}-${n + 1}`);
  }
  const ref = (id: string, name: string) => ({ id, name, slug: slugOf.get(id) ?? null });
  for (const ev of upcomingEvents) {
    for (const b of ev.bouts) {
      b.a.slug = slugOf.get(b.a.id!) ?? null;
      b.b.slug = slugOf.get(b.b.id!) ?? null;
    }
  }

  // 4. Detalhes por lutador ------------------------------------------------------------
  console.log(`• Montando ${scope.size} perfis…`);
  const details: FighterDetail[] = [];
  const blankMB = (): MethodBreakdown => ({
    KO: { n: 0, byRound: [0, 0, 0, 0, 0] }, SUB: { n: 0, byRound: [0, 0, 0, 0, 0] },
    DEC: { n: 0, byRound: [0, 0, 0, 0, 0] }, OTHER: { n: 0, byRound: [0, 0, 0, 0, 0] },
  });

  const withHeadshot = await checkHeadshots([...scope].map((id) => espnOf.get(id)).filter((x): x is string => !!x), offline);
  for (const id of scope) {
    const bio = bios.get(id);
    const st = proc.states.get(id) ?? emptyState();
    if (!proc.states.has(id) && bio) {
      st.dob = bio.dob; st.reach = bio.reachIn; st.height = bio.heightIn;
    }
    const raw = fightsBy.get(id) ?? [];
    const entries: FightEntry[] = [];
    const wins = blankMB();
    const losses = blankMB();
    const target = { head: 0, body: 0, leg: 0 };
    const targetAbs = { head: 0, body: 0, leg: 0 };
    const position = { dist: 0, clinch: 0, ground: 0 };
    for (const f of raw) {
      const i = f.fighters[0].id === id ? 0 : 1;
      const o = 1 - i;
      const snap = proc.snapshots.get(f.id)!;
      const result = f.outcome === 'NC' ? 'NC' : f.outcome === 'D' ? 'D' : f.winner === i ? 'W' : 'L';
      if (result === 'W' || result === 'L') {
        const mb = result === 'W' ? wins : losses;
        const key = f.method === 'KO' || f.method === 'SUB' || f.method === 'DEC' ? f.method : 'OTHER';
        mb[key].n++;
        mb[key].byRound[Math.min(4, f.endRound - 1)]++;
      }
      if (f.stats) {
        const me = f.stats[i];
        const op = f.stats[o];
        target.head += me[S.headL]; target.body += me[S.bodyL]; target.leg += me[S.legL];
        targetAbs.head += op[S.headL]; targetAbs.body += op[S.bodyL]; targetAbs.leg += op[S.legL];
        position.dist += me[S.distL]; position.clinch += me[S.clinchL]; position.ground += me[S.groundL];
      }
      const opp = f.fighters[o];
      entries.push({
        id: f.id, date: f.date, event: f.event, eventId: f.eventId, location: f.location,
        division: f.division, title: f.title, interim: f.interim, scheduledRounds: f.scheduledRounds,
        opponent: ref(opp.id, opp.name),
        result, method: f.method, decision: f.decision, detail: f.detail,
        endRound: f.endRound, endTime: f.endTime, durationSec: f.durationSec, referee: f.referee,
        recordBefore: snap.recordBefore[i], oppRecordBefore: snap.recordBefore[o],
        eloBefore: Math.round(snap.eloBefore[i]), eloAfter: Math.round(snap.eloAfter[i]), oppEloBefore: Math.round(snap.eloBefore[o]),
        stats: f.stats ? { me: f.stats[i], opp: f.stats[o], rounds: f.rounds.map((r) => [r[i], r[o]]) } : null,
      });
    }
    entries.reverse(); // mais recente primeiro
    const division = raw.length ? lastDivision(id) : nextBout.get(id)?.division ?? 'OPEN';
    const rates = computeRates(st, entries);
    const age = bio?.dob ? Math.floor(years(bio.dob, today)) : null;
    const streakN = recentStreak(entries);
    const lastRes = entries.find((e) => e.result !== 'NC')?.result;
    const hist = proc.eloHistory.get(id) ?? [];
    details.push({
      id,
      slug: slugOf.get(id)!,
      name: nameOf(id),
      nickname: bio?.nickname ?? '',
      division,
      women: DIVISION_BY_KEY[division]?.women ?? false,
      record: {
        w: st.wins, l: st.losses, d: st.draws,
        nc: entries.filter((e) => e.result === 'NC').length,
      },
      elo: Math.round(st.elo),
      lastFight: entries[0]?.date ?? null,
      age,
      style: '',
      streak: lastRes && streakN ? `${lastRes === 'W' ? 'V' : lastRes === 'L' ? 'D' : 'E'}${streakN}` : '',
      upcoming: nextBout.has(id),
      ...(() => {
        const eid = espnOf.get(id);
        const ath = eid ? espn.athletes.get(eid) : undefined;
        const geo = { country: ath?.country ? countryPt(ath.country) : '', flag: ath?.flag ?? '' };
        if (eid && withHeadshot.has(eid)) return { ...geo, photo: espnHeadshot(eid), photoPage: espnPage(eid) };
        const ph = photoOf(nameOf(id), bio?.dob ?? null);
        return { ...geo, photo: ph?.url ?? null, photoPage: ph?.page ?? null };
      })(),
      divisions: [...new Set(entries.map((e) => e.division))],
      heightCm: cm(bio?.heightIn ?? null),
      reachCm: cm(bio?.reachIn ?? null),
      stance: bio?.stance ?? '',
      dob: bio?.dob ?? null,
      firstFight: entries.length ? entries[entries.length - 1].date : null,
      eloPeak: hist.length ? Math.max(...hist.map((h) => h[1])) : 1500,
      eloHistory: hist,
      rates,
      percentiles: {},
      statRanks: {},
      titleReigns: [],
      form: computeForm(entries),
      official: null,
      champ: null,
      eloRank: null,
      totals: st,
      wins, losses, target, targetAbs, position,
      styleTags: [], styleText: '',
      strengths: [], weaknesses: [],
      fiveRoundFights: entries.filter((e) => e.scheduledRounds === 5).length,
      titleFights: entries.filter((e) => e.title).length,
      fights: entries,
      next: nextBout.get(id) ?? null,
      fv: currentSnapshot(feat.states, id, bio, priorsFor(priors, division)),
    });
  }

  // percentis, estilo, pontos fortes/fracos, ranking Elo
  const ranksOut = new Map<string, Partial<Record<keyof FighterDetail['rates'], StatRank>>>();
  const pcts = computePercentiles(details.map((d) => ({ id: d.id, group: d.division, women: d.women, rates: d.rates, st: d.totals })), ranksOut);
  for (const d of details) {
    d.percentiles = pcts.get(d.id) ?? {};
    d.statRanks = ranksOut.get(d.id) ?? {};
    const s = classifyStyle(d.totals, d.rates, d.percentiles, d.target, d.position);
    d.style = s.style;
    d.styleTags = s.tags;
    d.styleText = s.text;
    const sw = strengthsWeaknesses(d.totals, d.rates, d.percentiles, d.fights, DIVISION_BY_KEY[d.division]?.name ?? 'UFC', today, d.age);
    d.strengths = sw.strengths;
    d.weaknesses = sw.weaknesses;
  }
  const byDiv = new Map<string, FighterDetail[]>();
  for (const d of details) {
    if (!d.fights.length) continue;
    if (!byDiv.has(d.division)) byDiv.set(d.division, []);
    byDiv.get(d.division)!.push(d);
  }
  for (const list of byDiv.values()) {
    list.sort((a, b) => b.elo - a.elo);
    list.forEach((d, i) => (d.eloRank = { division: i + 1, of: list.length }));
  }

  // 5. Eventos concluídos (desde SCOPE_FROM) -------------------------------------------------
  const pastEvents = new Map<string, EventInfo>();
  for (const f of fights) {
    if (f.date < SCOPE_FROM) continue;
    if (!pastEvents.has(f.eventId)) {
      const ev = events.get(f.eventId)!;
      pastEvents.set(f.eventId, { id: ev.id, name: ev.name, date: ev.date, location: ev.location, upcoming: false, fights: [], bouts: [] });
    }
    pastEvents.get(f.eventId)!.fights.push({
      id: f.id,
      a: ref(f.fighters[0].id, f.fighters[0].name),
      b: ref(f.fighters[1].id, f.fighters[1].name),
      winner: f.winner,
      result: f.outcome,
      method: f.method,
      decision: f.decision,
      detail: f.detail,
      endRound: f.endRound,
      endTime: f.endTime,
      division: f.division,
      title: f.title,
      scheduledRounds: f.scheduledRounds,
    });
  }
  // o CSV traz o card do evento principal para baixo; invertemos p/ main event no topo
  const past = [...pastEvents.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  // 6. Escrita -----------------------------------------------------------------------------------
  console.log('• Gravando JSON…');
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'fighters'), { recursive: true });
  await writeFile(path.join(OUT, 'model.json'), JSON.stringify(model));
  await writeFile(path.join(OUT, 'events.json'), JSON.stringify({ upcoming: upcomingEvents, past }));

  // disputas de cinturão + finais de torneio (histórico completo)
  const titles: TitleFight[] = fights
    .filter((f) => f.title || f.tournament)
    .map((f) => ({
      id: f.id, date: f.date, event: f.event, eventId: f.eventId, division: f.division,
      interim: f.interim, tournament: f.tournament,
      label: f.tournament ? f.weightClassRaw.replace(/\s*tournament\s*title\s*bout/i, '').replace(/^the ultimate fighter|^ultimate fighter/i, 'TUF').replace(/^tuf nations/i, 'TUF Nations')
        .replace(/\s*(women's\s+)?(light heavyweight|heavyweight|middleweight|welterweight|lightweight|featherweight|bantamweight|flyweight|strawweight)\s*$/i, '').trim() : '',
      a: ref(f.fighters[0].id, f.fighters[0].name),
      b: ref(f.fighters[1].id, f.fighters[1].name),
      winner: f.winner, result: f.outcome, method: f.method, decision: f.decision, detail: f.detail,
      endRound: f.endRound, endTime: f.endTime, scheduledRounds: f.scheduledRounds,
      statsSlug: f.stats ? (slugOf.get(f.fighters[0].id) ?? slugOf.get(f.fighters[1].id) ?? null) : null,
    }))
    .reverse();
  await writeFile(path.join(OUT, 'titles.json'), JSON.stringify(titles));

  // linha do tempo dos cinturões
  console.log('• Montando a linha do tempo dos cinturões…');
  const big = (u: string) => u.replace('w=240&h=174', 'w=700&h=508');
  const th = await buildTitleHistory({
    fights,
    slugOf: (id) => slugOf.get(id) ?? null,
    photoById: new Map(details.filter((d) => d.photo).map((d) => [d.id, big(d.photo!)])),
    wikiPhoto: (n) => photoOf(n, null)?.url ?? null,
    offline,
  });
  await writeFile(path.join(OUT, 'title-history.json'), JSON.stringify(th.history));
  console.log(`  ${Object.values(th.history.divisions).reduce((n, d) => n + d.chapters.length, 0)} lutas de cinturão · ${Object.keys(th.history.photos).length} fotos · sem foto: ${th.missingPhotos.length}`);
  await writeFile(path.join('data', 'raw', 'sem-foto-cinturoes.txt'), th.missingPhotos.join('\n'));

  // ranking oficial (Meta UFC Rankings) + passagens por cinturões (dependem do histórico de títulos)
  const detailById = new Map(details.map((d) => [d.id, d]));
  const unmatched: string[] = [];
  for (const e of officialRankings.entries) {
    const d = detailById.get(idByName.get(norm(e.name)) ?? '');
    if (d) d.official = { division: e.division as DivisionKey, pos: e.pos, interim: e.interim };
    else unmatched.push(e.name);
  }
  console.log(`  Ranking oficial (${officialRankings.released ?? 'indisponível'}): ${officialRankings.entries.length - unmatched.length} de ${officialRankings.entries.length} no site${unmatched.length ? ` · fora do escopo ou sem correspondência: ${unmatched.join(', ')}` : ''}`);
  const board: OfficialBoard = {
    released: officialRankings.released,
    divisions: MAIN_DIVISIONS.map((dv) => ({
      key: dv.key, name: dv.name, women: dv.women,
      entries: officialRankings.entries.filter((e) => e.division === dv.key).sort((x, y) => x.pos - y.pos).map((e) => {
        const id = idByName.get(norm(e.name)) ?? null;
        const d = id ? detailById.get(id) : undefined;
        return { pos: e.pos, name: e.name, id: d ? id : null, slug: d?.slug ?? null };
      }),
    })).filter((dv) => dv.entries.length),
  };
  await writeFile(path.join(OUT, 'official-rankings.json'), JSON.stringify(board));
  for (const [key, div] of Object.entries(th.history.divisions)) {
    const story = buildStory(div, today);
    const add = (id: string | undefined, rg: TitleReign) => { const d = id ? detailById.get(id) : undefined; if (d) d.titleReigns.push(rg); };
    for (const rg of story.reigns) {
      add(idByName.get(norm(rg.name)), { division: key, divisionName: div.name, kind: 'champion', start: rg.start, end: rg.ongoing ? null : rg.end, def: rg.def, endKind: rg.endKind });
    }
    let lastInterim = '';
    for (const c of div.chapters) {
      if (!c.interim || c.result !== 'W') continue;
      if (c.a.name !== lastInterim) add(c.a.id ?? undefined, { division: key, divisionName: div.name, kind: 'interim', start: c.date, end: null, def: 0, endKind: 'interim' });
      lastInterim = c.a.name;
    }
  }
  for (const d of details) {
    d.titleReigns.sort((x, y) => x.start.localeCompare(y.start));
    const real = d.titleReigns.filter((t) => t.kind === 'champion' && t.division !== 'BMF');
    d.champ = real.some((t) => t.end === null) ? 'atual' : real.length ? 'ex' : null;
  }

  const summaries: FighterSummary[] = details
    .map(({ id, slug, name, nickname, division, women, record, elo, lastFight, age, style, streak, upcoming, photo, photoPage, country, flag, official, champ }) => ({
      id, slug, name, nickname, division, women, record, elo, lastFight, age, style, streak, upcoming, photo, photoPage, country, flag, official, champ,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(path.join(OUT, 'fighters.json'), JSON.stringify(summaries));
  for (const d of details) await writeFile(path.join(OUT, 'fighters', `${d.slug}.json`), JSON.stringify(d));

  // ranking: valores por lutador (só quem já lutou no UFC)
  const rankings: RankingRow[] = details
    .filter((d) => d.fights.length)
    .map((d) => {
      const t = d.totals;
      const r = d.rates;
      const decisive = t.wins + t.losses;
      const firstStreak = d.streak.startsWith('V') ? Number(d.streak.slice(1)) : 0;
      return {
        id: d.id,
        s: {
          age: d.dob ? years(d.dob, today) : null,
          height: d.heightCm, reach: d.reachCm,
          ape: d.heightCm && d.reachCm ? d.reachCm - d.heightCm : null,
          elo: d.elo, eloPeak: d.eloPeak,
          tenure: d.firstFight ? years(d.firstFight, today) : null,
          avgMin: r.avgFightMin || null,
          five: d.fiveRoundFights, titleFights: d.titleFights,
          titleWins: d.fights.filter((f) => f.title && f.result === 'W').length,
          fights: t.fights, wins: t.wins, losses: t.losses,
          koW: t.koW, subW: t.subW, decW: t.decW, fin: t.koW + t.subW,
          winPct: decisive ? t.wins / decisive : null,
          streak: firstStreak,
          slpm: r.slpm, acc: t.sigA ? r.acc : null, sapm: r.sapm, def: t.sigOppA ? r.def : null,
          td: r.td, tdAcc: t.tdA ? r.tdAcc : null, tdDef: t.tdOppA ? r.tdDef : null,
          sub: r.sub, kd: r.kd, kdAbs: r.kdAbs, ctrl: r.ctrl,
          finishRate: t.wins ? r.finishRate : null,
          minutes: t.time / 60,
        },
      };
    });
  const round4 = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);
  await writeFile(path.join(OUT, 'rankings.json'), JSON.stringify(rankings, round4));
  const latest = fights[fights.length - 1];
  const meta: Meta = {
    generatedAt: new Date().toISOString(),
    latestEvent: latest ? { name: latest.event, date: latest.date } : null,
    scopeFrom: SCOPE_FROM,
    fighterCount: details.length,
    fightCount: fights.length,
    model: model.metrics,
    upcomingSource,
    rankingsDate: officialRankings.released,
  };
  await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(`  ${details.filter((d) => d.photo).length} lutadores com foto · ${titles.filter((t) => !t.tournament).length} disputas de cinturão`);
  console.log(`✔ Pronto: ${details.length} lutadores, ${past.length} eventos em ${SCOPE_FROM.slice(0, 4)}, ${upcomingEvents.length} eventos futuros (${upcomingSource}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
