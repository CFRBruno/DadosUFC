import { fmtInt, fmtNum, fmtPct } from './format';

export interface RankStat {
  key: string;
  label: string;
  group: 'Físico e experiência' | 'Cartel no UFC' | 'Estatísticas no UFC';
  fmt: (n: number) => string;
  /** sentido padrão: 'desc' = maior primeiro */
  dir: 'desc' | 'asc';
  /** taxa (precisa de amostra mínima para fazer sentido) */
  rate?: boolean;
  hint?: string;
}

const years = (n: number) => `${Math.floor(n)} anos`;
const cm = (n: number) => `${Math.round(n)} cm`;
const signedCm = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)} cm`;

export const RANK_STATS: RankStat[] = [
  // físico e experiência
  { key: 'age', label: 'Idade', group: 'Físico e experiência', fmt: years, dir: 'desc' },
  { key: 'height', label: 'Altura', group: 'Físico e experiência', fmt: cm, dir: 'desc' },
  { key: 'reach', label: 'Envergadura', group: 'Físico e experiência', fmt: cm, dir: 'desc' },
  { key: 'ape', label: 'Envergadura − altura', group: 'Físico e experiência', fmt: signedCm, dir: 'desc', hint: 'Quanto a envergadura passa da altura' },
  { key: 'elo', label: 'Rating Elo', group: 'Físico e experiência', fmt: fmtInt, dir: 'desc' },
  { key: 'eloPeak', label: 'Pico de Elo', group: 'Físico e experiência', fmt: fmtInt, dir: 'desc' },
  { key: 'tenure', label: 'Tempo de UFC', group: 'Físico e experiência', fmt: (n) => `${fmtNum(n, 1)} anos`, dir: 'desc', hint: 'Desde a estreia no UFC' },
  { key: 'avgMin', label: 'Tempo médio de luta', group: 'Físico e experiência', fmt: (n) => `${fmtNum(n, 1)} min`, dir: 'desc', rate: true },
  { key: 'five', label: 'Lutas de 5 rounds', group: 'Físico e experiência', fmt: fmtInt, dir: 'desc' },
  { key: 'titleFights', label: 'Disputas de cinturão', group: 'Físico e experiência', fmt: fmtInt, dir: 'desc' },
  { key: 'titleWins', label: 'Vitórias em disputa de cinturão', group: 'Físico e experiência', fmt: fmtInt, dir: 'desc' },
  // cartel
  { key: 'fights', label: 'Lutas no UFC', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'wins', label: 'Vitórias', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'losses', label: 'Derrotas', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'koW', label: 'Vitórias por KO/TKO', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'subW', label: 'Vitórias por finalização', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'decW', label: 'Vitórias por decisão', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'fin', label: 'Vitórias antes do fim (KO + finalização)', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  { key: 'winPct', label: '% de vitórias', group: 'Cartel no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
  { key: 'streak', label: 'Sequência de vitórias atual', group: 'Cartel no UFC', fmt: fmtInt, dir: 'desc' },
  // estatísticas (mesmas chaves dos cartões do perfil)
  { key: 'slpm', label: 'Golpes sig. conectados/min', group: 'Estatísticas no UFC', fmt: (n) => fmtNum(n, 2), dir: 'desc', rate: true },
  { key: 'acc', label: 'Precisão de golpes', group: 'Estatísticas no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
  { key: 'sapm', label: 'Golpes sig. absorvidos/min', group: 'Estatísticas no UFC', fmt: (n) => fmtNum(n, 2), dir: 'asc', rate: true, hint: 'Menos é melhor' },
  { key: 'def', label: 'Defesa de golpes', group: 'Estatísticas no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
  { key: 'td', label: 'Quedas por 15 min', group: 'Estatísticas no UFC', fmt: (n) => fmtNum(n, 2), dir: 'desc', rate: true },
  { key: 'tdAcc', label: 'Precisão de quedas', group: 'Estatísticas no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
  { key: 'tdDef', label: 'Defesa de quedas', group: 'Estatísticas no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
  { key: 'sub', label: 'Finalizações tentadas/15 min', group: 'Estatísticas no UFC', fmt: (n) => fmtNum(n, 2), dir: 'desc', rate: true },
  { key: 'kd', label: 'Knockdowns/15 min', group: 'Estatísticas no UFC', fmt: (n) => fmtNum(n, 2), dir: 'desc', rate: true },
  { key: 'kdAbs', label: 'Knockdowns sofridos/15 min', group: 'Estatísticas no UFC', fmt: (n) => fmtNum(n, 2), dir: 'asc', rate: true, hint: 'Menos é melhor' },
  { key: 'ctrl', label: 'Tempo em controle', group: 'Estatísticas no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
  { key: 'finishRate', label: 'Vitórias antes do fim (%)', group: 'Estatísticas no UFC', fmt: (n) => fmtPct(n), dir: 'desc', rate: true },
];

export const RANK_BY_KEY = Object.fromEntries(RANK_STATS.map((s) => [s.key, s])) as Record<string, RankStat>;

/** Link para o ranking de uma estatística, já filtrado pela categoria. */
export const rankingUrl = (key: string, division?: string) =>
  `/ranking?stat=${key}${division && division !== 'CW' && division !== 'OPEN' ? `&modo=cat&cat=${division}` : ''}`;
