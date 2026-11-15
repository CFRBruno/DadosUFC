// Motor da linha do tempo: transforma lutas + notas em capítulos com estado
// (campeão, interino, defesas, dias de reinado) e recordes que evoluem no tempo.

import type { TitleChapter, TitleDivision, TitleNote } from '../shared/titleTypes';

export type RecKey = 'def' | 'wins' | 'reign' | 'sub' | 'ko' | 'vol';
export interface RecState { value: number; who: string; date: string; prev: { who: string; value: number }[] }
export const REC_DEFS: { k: RecKey; label: string; low?: boolean; unit?: string }[] = [
  { k: 'def', label: 'Mais defesas seguidas' },
  { k: 'wins', label: 'Mais vitórias valendo cinturão' },
  { k: 'reign', label: 'Reinado mais longo', unit: ' dias' },
  { k: 'sub', label: 'Finalização mais rápida', low: true },
  { k: 'ko', label: 'Nocaute mais rápido', low: true },
  { k: 'vol', label: 'Mais golpes numa disputa', unit: ' sig.' },
];

export interface Snap {
  idx: number;
  kind: 'fight' | 'vacancy' | 'promotion' | 'note' | 'upcoming';
  date: string;
  dateLabel?: string;
  fight?: TitleChapter;
  note?: TitleNote;
  upcoming?: { event: string; a: string; b: string };
  kicker: string;
  headline: string; // com <em>
  champ: string | null;
  prevChamp: string | null;
  def: number;
  reignDays: number;
  interimChamp: string | null;
  rec: Partial<Record<RecKey, RecState>>;
  broken: RecKey[];
}

export interface Reign { name: string; start: string; end: string; def: number; days: number; ongoing: boolean; endKind: 'lost' | 'vacated' | 'ongoing' }

const DAY = 864e5;
export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));
const PART = ['dos', 'da', 'de', 'do', 'das', 'van', 'von', 'di', 'du', 'st.'];
export const sur = (n: string) => {
  const p = n.split(' ');
  if (p.length < 2) return n;
  const k = p.length - 2;
  return PART.includes(p[k].toLowerCase()) ? `${p[k][0].toUpperCase()}${p[k].slice(1)} ${p[k + 1]}` : p[p.length - 1];
};
const ord = (n: number) => `${n}ª`;

export function buildStory(div: TitleDivision, today: string): { snaps: Snap[]; reigns: Reign[] } {
  const f = div.women;
  const G = {
    champ: f ? 'campeã' : 'campeão',
    newChamp: f ? 'a <em>nova campeã</em>' : 'o <em>novo campeão</em>',
    first: f ? 'a <em>primeira campeã</em>' : 'o <em>primeiro campeão</em>',
    theInterim: f ? 'a interina' : 'o interino',
  };
  type Item = { t: 'fight'; c: TitleChapter } | { t: 'note'; n: TitleNote };
  const items: Item[] = [
    ...div.chapters.map((c) => ({ t: 'fight' as const, c })),
    ...div.notes.map((n) => ({ t: 'note' as const, n })),
  ].sort((x, y) => {
    const dx = x.t === 'fight' ? x.c.date : x.n.date;
    const dy = y.t === 'fight' ? y.c.date : y.n.date;
    if (dx !== dy) return dx < dy ? -1 : 1;
    return x.t === 'note' ? -1 : 1; // nota (vacância/promoção) antes da luta do mesmo dia
  });

  const st = { first: true, champ: null as string | null, since: null as string | null, def: 0, interim: null as string | null, wins: {} as Record<string, number> };
  const rec: Partial<Record<RecKey, RecState>> = {};
  const reigns: Reign[] = [];
  const snaps: Snap[] = [];

  const setRec = (k: RecKey, value: number, who: string, date: string): boolean => {
    const def = REC_DEFS.find((d) => d.k === k)!;
    const cur = rec[k];
    const better = !cur || (def.low ? value < cur.value : value > cur.value);
    if (!better) return false;
    if (cur && cur.who === who && (k === 'def' || k === 'wins' || k === 'reign')) {
      rec[k] = { ...cur, value, date };
      return false; // o próprio dono ampliando o recorde
    }
    rec[k] = { value, who, date, prev: cur ? [{ who: cur.who, value: cur.value }, ...cur.prev].slice(0, 3) : [] };
    return !!cur;
  };
  // ao fim de um reinado (derrota ou vacância), mede o reinado inteiro para o recorde
  let pendingBroken: RecKey[] = [];
  const closeReignRecord = (date: string) => {
    if (st.champ && st.since && setRec('reign', daysBetween(st.since, date), st.champ, date)) pendingBroken.push('reign');
  };
  const startReign = (name: string, date: string) => {
    closeReignRecord(date);
    const last = reigns[reigns.length - 1];
    if (last && last.endKind === 'ongoing') { last.end = date; last.endKind = 'lost'; last.ongoing = false; last.days = daysBetween(last.start, date); }
    reigns.push({ name, start: date, end: today, def: 0, days: 0, ongoing: true, endKind: 'ongoing' });
    st.champ = name; st.since = date; st.def = 0; st.first = false;
  };
  const endReign = (date: string) => {
    closeReignRecord(date);
    const last = reigns[reigns.length - 1];
    if (last && last.endKind === 'ongoing') { last.end = date; last.endKind = 'vacated'; last.ongoing = false; last.days = daysBetween(last.start, date); }
    st.champ = null; st.since = null; st.def = 0;
  };

  items.forEach((it, idx) => {
    let kicker = '';
    let headline = '';
    let prevChamp: string | null = null;
    const broken: RecKey[] = [];
    pendingBroken = broken;
    let date: string;
    if (it.t === 'note') {
      const n = it.n;
      date = n.date;
      kicker = n.kind === 'promotion' ? (f ? 'A PRIMEIRA CAMPEÃ' : 'O PRIMEIRO CAMPEÃO') : n.kind === 'note' ? 'REVIRAVOLTA' : n.interimOnly ? 'INTERINO VAGO' : n.promote ? 'PROMOÇÃO' : 'CINTURÃO VAGO';
      headline = n.title;
      if (n.kind === 'promotion') {
        startReign(n.who, n.date);
      } else if (n.kind === 'vacancy') {
        if (n.interimOnly) st.interim = null;
        else {
          prevChamp = st.champ;
          endReign(n.date);
          if (n.alsoInterim) st.interim = null;
          if (n.promote) { startReign(n.promote, n.date); st.interim = null; }
        }
      }
    } else {
      const c = it.c;
      date = c.date;
      const W = c.a.name, L = c.b.name;
      if (c.result !== 'W') {
        kicker = c.result === 'D' ? 'EMPATE' : 'SEM RESULTADO';
        const keep = st.champ ? `o cinturão fica com <em>${st.champ}</em>` : 'o cinturão <em>segue vago</em>';
        headline = c.result === 'D' ? `${W} e ${L} empatam — ${keep}` : `${W} × ${L} termina sem resultado — ${keep}`;
      } else {
        const verb = c.method === 'KO' ? 'nocauteia' : c.method === 'SUB' ? 'finaliza' : 'vence';
        const how = c.method === 'DEC' ? ' nos pontos' : c.method === 'DQ' ? ' por desclassificação' : '';
        st.wins[W] = (st.wins[W] || 0) + 1;
        if (c.interim) {
          const defending = st.interim === W;
          st.interim = W;
          kicker = defending ? 'DEFESA DO INTERINO' : 'CINTURÃO INTERINO';
          headline = defending ? `${W} ${verb} ${L}${how} e mantém o <em>cinturão interino</em>` : `${W} ${verb} ${L}${how} e conquista o <em>cinturão interino</em>`;
        } else if (st.champ === W) {
          st.def += 1;
          const last = reigns[reigns.length - 1];
          if (last) last.def = st.def;
          const unif = st.interim === L;
          if (unif) st.interim = null;
          kicker = unif ? 'UNIFICAÇÃO' : `${ord(st.def)} DEFESA`;
          headline = unif ? `${W} ${verb} ${G.theInterim} ${L}${how} e <em>unifica os cinturões</em>` : `${W} ${verb} ${L}${how} e defende o cinturão pela <em>${ord(st.def)} vez</em>`;
        } else {
          const first = st.first;
          const wasVacant = !st.champ;
          const unif = st.interim === W && !!st.champ;
          const old = st.champ;
          if (st.interim === W) st.interim = null;
          startReign(W, c.date);
          kicker = first ? (f ? 'A PRIMEIRA CAMPEÃ' : 'O PRIMEIRO CAMPEÃO') : unif ? 'UNIFICAÇÃO' : f ? 'NOVA CAMPEÃ' : 'NOVO CAMPEÃO';
          headline = first
            ? `${W} ${verb} ${L}${how} e se torna ${G.first} da categoria`
            : unif
              ? `${f ? 'A interina' : 'O interino'} ${W} ${verb} ${old!}${how} e <em>unifica os cinturões</em>`
              : wasVacant
                ? `${W} ${verb} ${L}${how} e conquista o <em>cinturão vago</em>`
                : `${W} ${verb} ${L}${how} e é ${G.newChamp}`;
        }
        if (!c.interim && st.champ === W && st.def > 0 && setRec('def', st.def, W, c.date)) broken.push('def');
        if (setRec('wins', st.wins[W], W, c.date)) broken.push('wins');
        if (c.method === 'SUB' && setRec('sub', c.sec, W, c.date)) broken.push('sub');
        if (c.method === 'KO' && setRec('ko', c.sec, W, c.date)) broken.push('ko');
        if (c.sa && setRec('vol', c.sa.sig, W, c.date)) broken.push('vol');
        // na primeira ocorrência de cada recorde não há "quebra", mas marcamos como estabelecido
      }
    }
    const reignDays = st.champ && st.since ? daysBetween(st.since, date) : 0;
    if (st.champ && setRec('reign', reignDays, st.champ, date)) broken.push('reign');
    snaps.push({
      idx, kind: it.t === 'fight' ? 'fight' : it.n.kind, date, dateLabel: it.t === 'note' ? it.n.dateLabel : undefined,
      fight: it.t === 'fight' ? it.c : undefined, note: it.t === 'note' ? it.n : undefined,
      kicker, headline, champ: st.champ, prevChamp, def: st.def, reignDays, interimChamp: st.interim,
      rec: JSON.parse(JSON.stringify(rec)), broken,
    });
  });

  // próximas lutas valendo o cinturão (ex.: BMF)
  for (const u of div.upcoming) {
    snaps.push({
      idx: snaps.length, kind: 'upcoming', date: today, upcoming: u,
      kicker: 'PRÓXIMO CAPÍTULO',
      headline: `${u.a} × ${u.b} — <em>${u.event}</em>`,
      champ: st.champ, prevChamp: null, def: st.def, reignDays: st.champ && st.since ? daysBetween(st.since, today) : 0,
      interimChamp: st.interim, rec: JSON.parse(JSON.stringify(rec)), broken: [],
    });
  }
  // reinado em andamento conta até hoje
  const last = reigns[reigns.length - 1];
  if (last && last.endKind === 'ongoing') last.days = daysBetween(last.start, today);
  return { snaps, reigns };
}
