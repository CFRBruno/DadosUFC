import { useEffect, useState } from 'react';
import type { EventInfo, FighterDetail, FighterSummary, Meta, ModelParams, OfficialBoard } from '../shared/types';

const BASE = import.meta.env.BASE_URL + 'data/';
const cache = new Map<string, Promise<unknown>>();

export function loadJson<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(BASE + path).then((r) => {
      if (!r.ok) throw new Error(r.status === 404 ? 'não encontrado' : `erro ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export interface Resource<T> { data: T | null; error: string | null; loading: boolean }

export function useJson<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    loadJson<T>(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

export const useFighters = () => useJson<FighterSummary[]>('fighters.json');
export const useFighter = (slug: string | null | undefined) => useJson<FighterDetail>(slug ? `fighters/${slug}.json` : null);
export const useEvents = () => useJson<{ upcoming: EventInfo[]; past: EventInfo[] }>('events.json');
export const useModel = () => useJson<ModelParams>('model.json');
export const useOfficialBoard = () => useJson<OfficialBoard>('official-rankings.json');
export const useMeta = () => useJson<Meta>('meta.json');
