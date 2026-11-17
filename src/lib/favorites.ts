// Favoritos (lutadores e eventos), guardados só neste aparelho (localStorage); sem login.
import { useSyncExternalStore } from 'react';

interface Fav { fighters: string[]; events: string[] }
const KEY = 'dadosufc-favoritos';
let state: Fav = { fighters: [], events: [] };
try { const raw = localStorage.getItem(KEY); if (raw) { const p = JSON.parse(raw); state = { fighters: p.fighters ?? [], events: p.events ?? [] }; } } catch { /* sem armazenamento */ }
const subs = new Set<() => void>();
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignora */ } subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
// atualiza se outra aba mudar
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { try { state = JSON.parse(e.newValue); subs.forEach((f) => f()); } catch { /* ignora */ } } });

export type FavKind = 'fighters' | 'events';
export function toggleFav(kind: FavKind, id: string) {
  const has = state[kind].includes(id);
  state = { ...state, [kind]: has ? state[kind].filter((x) => x !== id) : [...state[kind], id] };
  emit();
}
export const useFavorites = () => useSyncExternalStore(subscribe, () => state);
