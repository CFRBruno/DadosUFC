// Categorias de peso do UFC (masculino e feminino).

export type DivisionKey =
  | 'FLW' | 'BW' | 'FW' | 'LW' | 'WW' | 'MW' | 'LHW' | 'HW'
  | 'WSW' | 'WFLW' | 'WBW' | 'WFW'
  | 'CW' | 'OPEN';

export interface Division {
  key: DivisionKey;
  name: string;      // nome em pt-BR
  short: string;     // nome curto
  lbs: number | null;
  kg: number | null;
  women: boolean;
  order: number;
}

export const DIVISIONS: Division[] = [
  { key: 'FLW', name: 'Peso-Mosca', short: 'Mosca', lbs: 125, kg: 56.7, women: false, order: 1 },
  { key: 'BW', name: 'Peso-Galo', short: 'Galo', lbs: 135, kg: 61.2, women: false, order: 2 },
  { key: 'FW', name: 'Peso-Pena', short: 'Pena', lbs: 145, kg: 65.8, women: false, order: 3 },
  { key: 'LW', name: 'Peso-Leve', short: 'Leve', lbs: 155, kg: 70.3, women: false, order: 4 },
  { key: 'WW', name: 'Peso Meio-Médio', short: 'Meio-Médio', lbs: 170, kg: 77.1, women: false, order: 5 },
  { key: 'MW', name: 'Peso-Médio', short: 'Médio', lbs: 185, kg: 83.9, women: false, order: 6 },
  { key: 'LHW', name: 'Peso Meio-Pesado', short: 'Meio-Pesado', lbs: 205, kg: 93.0, women: false, order: 7 },
  { key: 'HW', name: 'Peso-Pesado', short: 'Pesado', lbs: 265, kg: 120.2, women: false, order: 8 },
  { key: 'WSW', name: 'Peso-Palha Feminino', short: 'Palha (F)', lbs: 115, kg: 52.2, women: true, order: 9 },
  { key: 'WFLW', name: 'Peso-Mosca Feminino', short: 'Mosca (F)', lbs: 125, kg: 56.7, women: true, order: 10 },
  { key: 'WBW', name: 'Peso-Galo Feminino', short: 'Galo (F)', lbs: 135, kg: 61.2, women: true, order: 11 },
  { key: 'WFW', name: 'Peso-Pena Feminino', short: 'Pena (F)', lbs: 145, kg: 65.8, women: true, order: 12 },
  { key: 'CW', name: 'Peso Casado', short: 'Casado', lbs: null, kg: null, women: false, order: 13 },
  { key: 'OPEN', name: 'Peso Aberto', short: 'Aberto', lbs: null, kg: null, women: false, order: 14 },
];

export const DIVISION_BY_KEY: Record<DivisionKey, Division> = Object.fromEntries(
  DIVISIONS.map((d) => [d.key, d]),
) as Record<DivisionKey, Division>;

/** Categorias "reais" (sem casado/aberto), usadas em filtros. */
export const MAIN_DIVISIONS = DIVISIONS.filter((d) => d.key !== 'CW' && d.key !== 'OPEN');

export interface ParsedWeightClass {
  division: DivisionKey;
  title: boolean;
  interim: boolean;
  women: boolean;
}

/** Converte o texto do UFCStats ("UFC Women's Flyweight Title Bout") na categoria. */
export function parseWeightClass(raw: string): ParsedWeightClass {
  const s = raw.toLowerCase();
  const women = s.includes('women');
  const title = s.includes('title');
  const interim = s.includes('interim');
  let division: DivisionKey = 'OPEN';
  if (s.includes('catch')) division = 'CW';
  else if (s.includes('light heavyweight')) division = 'LHW';
  else if (s.includes('heavyweight')) division = 'HW';
  else if (s.includes('middleweight')) division = 'MW';
  else if (s.includes('welterweight')) division = 'WW';
  else if (s.includes('lightweight')) division = 'LW';
  else if (s.includes('featherweight')) division = women ? 'WFW' : 'FW';
  else if (s.includes('bantamweight')) division = women ? 'WBW' : 'BW';
  else if (s.includes('flyweight')) division = women ? 'WFLW' : 'FLW';
  else if (s.includes('strawweight')) division = 'WSW';
  return { division, title, interim, women };
}

/** Limite de peso em libras usado para desambiguar homônimos. */
export function divisionLbs(key: DivisionKey): number | null {
  return DIVISION_BY_KEY[key]?.lbs ?? null;
}
