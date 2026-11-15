import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon, Logo } from './components/ui';
import { useMeta } from './lib/data';
import { fmtDate } from './lib/format';
import Home from './pages/Home';
import Fighters from './pages/Fighters';
import FighterPage from './pages/FighterPage';
import FightPage from './pages/FightPage';
import Compare from './pages/Compare';
import Events from './pages/Events';
import EventPage from './pages/EventPage';
import About from './pages/About';

const NAV = [
  { to: '/', label: 'Início', icon: 'home' as const, end: true },
  { to: '/lutadores', label: 'Lutadores', icon: 'users' as const },
  { to: '/comparar', label: 'Comparar', icon: 'swords' as const },
  { to: '/eventos', label: 'Eventos', icon: 'calendar' as const },
  { to: '/modelo', label: 'Modelo', icon: 'chart' as const },
];

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  const meta = useMeta().data;
  return (
    <>
      <header className="site-header">
        <div className="container bar">
          <Link to="/" className="logo" aria-label="DadosUFC — início">
            <Logo />
            <span>DADOS<span className="accent">UFC</span></span>
          </Link>
          <nav className="nav" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
            ))}
          </nav>
          <Link to="/comparar" className="btn btn-primary btn-sm header-cta">Comparar</Link>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lutadores" element={<Fighters />} />
          <Route path="/lutador/:slug" element={<FighterPage />} />
          <Route path="/lutador/:slug/luta/:fightId" element={<FightPage />} />
          <Route path="/comparar" element={<Compare />} />
          <Route path="/eventos" element={<Events />} />
          <Route path="/evento/:id" element={<EventPage />} />
          <Route path="/modelo" element={<About />} />
          <Route path="*" element={<div className="container empty"><h2>Página não encontrada</h2><p style={{ marginTop: 12 }}><Link to="/" className="btn btn-outline">Voltar ao início</Link></p></div>} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="container">
          <span>DadosUFC · uso pessoal · estatísticas somente de lutas no UFC</span>
          <span>
            Fonte: UFCStats{meta ? ` · atualizado em ${fmtDate(meta.generatedAt.slice(0, 10))}` : ''}
            {meta?.latestEvent ? ` · último evento: ${meta.latestEvent.name}` : ''}
          </span>
        </div>
      </footer>
      <nav className="bottom-nav" aria-label="Navegação">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
