import { NavLink } from 'react-router-dom';

/** Abas do ranking: estatísticas por lutador × zebras e favoritos (lutas). */
export default function RankTabs() {
  return (
    <div className="seg rank-tabs" role="tablist" aria-label="Tipo de ranking">
      <NavLink to="/ranking" end className={({ isActive }) => (isActive ? 'on' : '')}>Estatísticas</NavLink>
      <NavLink to="/ranking/zebras" className={({ isActive }) => (isActive ? 'on' : '')}>Zebras e favoritos</NavLink>
    </div>
  );
}
