// Acerto do modelo numa luta já realizada (previsão feita antes dela).
import type { EventFight, EventInfo } from '../shared/types';

/** true/false se o modelo acertou o vencedor; null se não há previsão ou se não houve vencedor. */
export function modelHit(f: EventFight): boolean | null {
  if (!f.pred || f.winner == null || f.result !== 'W') return null;
  const favA = f.pred.pA >= 0.5;
  return favA === (f.winner === 0);
}

/** Favorito do modelo e a chance que ele tinha. */
export function modelFavorite(f: EventFight): { name: string; p: number } | null {
  if (!f.pred) return null;
  const favA = f.pred.pA >= 0.5;
  return { name: favA ? f.a.name : f.b.name, p: favA ? f.pred.pA : 1 - f.pred.pA };
}

export function eventScore(e: EventInfo): { n: number; hits: number } {
  let n = 0, hits = 0;
  for (const f of e.fights) {
    const h = modelHit(f);
    if (h == null) continue;
    n++;
    if (h) hits++;
  }
  return { n, hits };
}
