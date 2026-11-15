// Pipeline de dados do DadosUFC.
//   npm run data            → baixa as fontes e gera public/data/
//   npm run data:offline    → usa os arquivos já baixados em data/raw/

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DIVISION_BY_KEY, parseWeightClass, type DivisionKey } from '../../src/shared/divisions';
import type {
  EventInfo, FightEntry, FighterDetail, FighterSummary, MethodBreakdown, Meta, UpcomingBout,
} from '../../src/shared/types';
import { S } from '../../src/shared/types';
import { emptyState } from '../../src/shared/model';
import { computePriors, processChronologically, trainModel } from './build';
import { fetchMirror, fetchUpcoming, rawExists, RAW_DIR, type ScrapedEvent } from './fetch';
import { classifyStyle, computePercentiles, computeRates, recentStreak, strengthsWeaknesses } from './insights';
import { loadDataset, type RawFight } from './load';

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
  try {
    const manual: ScrapedEvent[] = JSON.parse(await readFile('data/manual/upcoming.json', 'utf8')).events ?? [];
    for (const ev of manual) {
      if (!upcoming.some((u) => norm(u.name) === norm(ev.name))) {
        upcoming.push(ev);
        upcomingSource = upcomingSource === 'nenhuma' ? 'manual' : upcomingSource + ' + manual';
      }
    }
  } catch {
    /* sem arquivo manual */
  }

  // 2. Leitura e processamento ---------------------------------------------------
  console.log('• Lendo CSVs…');
  const { bios, fights, events } = await loadDataset();
  console.log(`  ${fights.length} lutas, ${bios.size} lutadores, ${events.size} eventos`);
  const { priors, fiveRoundDecFactor } = computePriors(fights);
  console.log('• Calculando Elo e estados pré-luta…');
  const proc = processChronologically(fights, bios, priors, fiveRoundDecFactor);
  console.log(`• Treinando modelo (${proc.samples.length} lutas)…`);
  const model = trainModel(proc.samples, priors, fiveRoundDecFactor);
  const m = model.metrics;
  console.log(
    `  Teste (${m.testN} lutas desde ${m.testFrom}): acerto ${(m.accuracy * 100).toFixed(1)}% ` +
      `(só Elo ${(m.eloOnlyAccuracy * 100).toFixed(1)}%), log-loss ${m.logLoss.toFixed(3)}, ` +
      `método ${(m.methodAccuracy * 100).toFixed(1)}%, exato ${(m.exactAccuracy * 100).toFixed(1)}%`,
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

  const scope = new Set<string>();
  for (const f of fights) if (f.date >= SCOPE_FROM) f.fighters.forEach((s) => scope.add(s.id));

  // próximos eventos
  const upcomingEvents: EventInfo[] = [];
  const nextBout = new Map<string, UpcomingBout>();
  const resolveUp = (p: { name: string; ufcstatsId: string | null }) => {
    if (p.ufcstatsId && (fightsBy.has(p.ufcstatsId) || bios.has(p.ufcstatsId))) return p.ufcstatsId;
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
      for (const [id, nm] of [[ia, bt.a.name], [ib, bt.b.name]]) {
        scope.add(id);
        if (!fightsBy.has(id)) debutants.set(id, nm);
      }
      const bout: UpcomingBout = {
        eventId: ev.id, event: ev.name, date: ev.date, division: wc.division, title: wc.title,
        rounds: order === 0 || wc.title ? 5 : 3, order,
        a: { id: ia, name: bt.a.name, slug: null },
        b: { id: ib, name: bt.b.name, slug: null },
      };
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
      divisions: [...new Set(entries.map((e) => e.division))],
      heightCm: cm(bio?.heightIn ?? null),
      reachCm: cm(bio?.reachIn ?? null),
      stance: bio?.stance ?? '',
      dob: bio?.dob ?? null,
      firstFight: entries.length ? entries[entries.length - 1].date : null,
      eloPeak: hist.length ? Math.max(...hist.map((h) => h[1])) : 1500,
      eloHistory: hist,
      eloRank: null,
      rates,
      percentiles: {},
      totals: st,
      wins, losses, target, targetAbs, position,
      styleTags: [], styleText: '',
      strengths: [], weaknesses: [],
      fiveRoundFights: entries.filter((e) => e.scheduledRounds === 5).length,
      titleFights: entries.filter((e) => e.title).length,
      fights: entries,
      next: nextBout.get(id) ?? null,
    });
  }

  // percentis, estilo, pontos fortes/fracos, ranking Elo
  const pcts = computePercentiles(details.map((d) => ({ id: d.id, group: d.division, women: d.women, rates: d.rates, st: d.totals })));
  for (const d of details) {
    d.percentiles = pcts.get(d.id) ?? {};
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
  const summaries: FighterSummary[] = details
    .map(({ id, slug, name, nickname, division, women, record, elo, lastFight, age, style, streak, upcoming }) => ({
      id, slug, name, nickname, division, women, record, elo, lastFight, age, style, streak, upcoming,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(path.join(OUT, 'fighters.json'), JSON.stringify(summaries));
  for (const d of details) await writeFile(path.join(OUT, 'fighters', `${d.slug}.json`), JSON.stringify(d));
  await writeFile(path.join(OUT, 'model.json'), JSON.stringify(model));
  await writeFile(path.join(OUT, 'events.json'), JSON.stringify({ upcoming: upcomingEvents, past }));
  const latest = fights[fights.length - 1];
  const meta: Meta = {
    generatedAt: new Date().toISOString(),
    latestEvent: latest ? { name: latest.event, date: latest.date } : null,
    scopeFrom: SCOPE_FROM,
    fighterCount: details.length,
    fightCount: fights.length,
    model: model.metrics,
    upcomingSource,
  };
  await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1));
  console.log(`✔ Pronto: ${details.length} lutadores, ${past.length} eventos em ${SCOPE_FROM.slice(0, 4)}, ${upcomingEvents.length} eventos futuros (${upcomingSource}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
