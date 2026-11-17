import { NavLink } from 'react-router-dom';

/** Abas do ranking: estatísticas por lutador × Elo histórico × zebras e favoritos (lutas). */
export default function RankTabs() {
  return (
    <div className="seg rank-tabs" role="tablist" aria-label="Tipo de ranking">
      <NavLink to="/ranking" end className={({ isActive }) => (isActive ? 'on' : '')}>Estatísticas</NavLink>
      <NavLink to="/ranking/ufc" className={({ isActive }) => (isActive ? 'on' : '')}>Ranking UFC</NavLink>
      <NavLink to="/ranking/elo" className={({ isActive }) => (isActive ? 'on' : '')}>Elo histórico</NavLink>
      <NavLink to="/ranking/zebras" className={({ isActive }) => (isActive ? 'on' : '')}>Zebras e favoritos</NavLink>
    </div>
  );
}
