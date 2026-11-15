import { DIVISION_BY_KEY, type DivisionKey } from '../shared/divisions';
import { DECISION_LABEL, METHOD_LABEL, type DecisionKind, type MethodKey } from '../shared/translate';

export const fmtNum = (n: number | null | undefined, d = 1) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const fmtInt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('pt-BR'));

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fmtDate(iso: string | null | undefined, long = false): string {
  if (!iso) return 'Data a definir';
  const [y, m, d] = iso.split('-').map(Number);
  if (long) return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}
export const fmtDateShort = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(y).slice(2)}`;
};

export const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export const divisionName = (k: DivisionKey | null | undefined, upcoming = false) =>
  !k ? '' : k === 'OPEN' && upcoming ? 'Categoria a definir' : DIVISION_BY_KEY[k]?.name ?? k;

export function methodText(m: MethodKey, decision: DecisionKind, detail?: string): string {
  if (m === 'DEC') return `Decisão${decision ? ' ' + DECISION_LABEL[decision] : ''}`;
  return METHOD_LABEL[m] + (detail ? ` · ${detail}` : '');
}

export const recordStr = (r: { w: number; l: number; d: number; nc?: number }) =>
  `${r.w}-${r.l}-${r.d}${r.nc ? ` (${r.nc} NC)` : ''}`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, i, arr) => i === 0 || i === arr.length - 1)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export const cmToFtIn = (cm: number | null) => {
  if (!cm) return '';
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
};

export function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - Date.parse(iso)) / 864e5);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
