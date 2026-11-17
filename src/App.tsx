import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { QuickSearch } from './components/fighters';
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
import Ranking from './pages/Ranking';
import Titles from './pages/Titles';
import Upsets from './pages/Upsets';
import EloPeaks from './pages/EloPeaks';
import Infograficos from './pages/Infograficos';
import OfficialRanking from './pages/OfficialRanking';

type Nav = { to: string; label: string; icon: Parameters<typeof Icon>[0]['name']; end?: boolean };
const NAV: Nav[] = [
  { to: '/', label: 'Início', icon: 'home', end: true },
  { to: '/lutadores', label: 'Lutadores', icon: 'users' },
  { to: '/comparar', label: 'Comparar', icon: 'swords' },
  { to: '/ranking', label: 'Ranking', icon: 'trophy' },
  { to: '/eventos', label: 'Eventos', icon: 'calendar' },
  { to: '/cinturoes', label: 'Cinturões', icon: 'belt' },
  { to: '/infograficos', label: 'Infográficos', icon: 'chart' },
  { to: '/modelo', label: 'Modelo', icon: 'chart' },
];
// no celular: 4 atalhos fixos + "Mais"
const MOBILE_MAIN = ['/', '/lutadores', '/comparar', '/eventos'];
const MOBILE_MORE = NAV.filter((n) => !MOBILE_MAIN.includes(n.to));

/** Instalação como app (PWA): usa o aviso nativo quando o navegador oferece; no iPhone, mostra o passo a passo. */
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
function useInstall() {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    const done = () => { setInstalled(true); setEv(null); };
    window.addEventListener('beforeinstallprompt', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) && !installed;
  // Firefox (Android) não dispara o aviso nativo: a instalação é feita pelo menu do navegador
  const firefox = /firefox/i.test(ua) && /android/i.test(ua) && !installed;
  return {
    available: !installed && (!!ev || ios || firefox),
    install: async () => {
      if (ev) { await ev.prompt(); await ev.userChoice; setEv(null); }
      else if (firefox) window.alert('Para instalar no Firefox: toque no menu ⋮ (três pontos) do navegador e escolha "Instalar" (em versões mais antigas: "Adicionar à tela inicial").');
      else if (ios) window.alert('Para instalar no iPhone/iPad: toque em Compartilhar (quadrado com seta) e depois em "Adicionar à Tela de Início".');
    },
  };
}

export default function App() {
  const pwa = useInstall();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    setMoreOpen(false);
  }, [pathname]);
  const meta = useMeta().data;

  // busca rápida: lupa, Ctrl/⌘+K ou "/"
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // indicador deslizante sob a aba ativa
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = navRef.current?.querySelector<HTMLElement>('a.active');
      setInd(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    place();
    window.addEventListener('resize', place);
    document.fonts?.ready.then(place);
    return () => window.removeEventListener('resize', place);
  }, [pathname]);

  // cabeçalho mais compacto ao rolar
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const moreActive = MOBILE_MORE.some((n) => pathname.startsWith(n.to));
  return (
    <>
      <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="container bar">
          <Link to="/" className="logo" aria-label="DadosUFC — início">
            <Logo />
            <span>DADOS<span className="accent">UFC</span></span>
          </Link>
          <nav className="nav" aria-label="Principal" ref={navRef}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
            ))}
            {ind && <span className="nav-ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} aria-hidden="true" />}
          </nav>
          <button className="search-btn" onClick={() => setSearchOpen(true)} aria-label="Buscar lutador" title="Buscar lutador (Ctrl+K ou /)">
            <Icon name="search" />
          </button>
          <Link to="/comparar" className="btn btn-primary btn-sm header-cta">Comparar</Link>
        </div>
      </header>
      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <main key={pathname.split('/').slice(0, 2).join('/')} className="page-enter">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lutadores" element={<Fighters />} />
          <Route path="/lutador/:slug" element={<FighterPage />} />
          <Route path="/lutador/:slug/luta/:fightId" element={<FightPage />} />
          <Route path="/comparar" element={<Compare />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/ranking/zebras" element={<Upsets />} />
          <Route path="/ranking/ufc" element={<OfficialRanking />} />
          <Route path="/ranking/elo" element={<EloPeaks />} />
          <Route path="/infograficos" element={<Infograficos />} />
          <Route path="/eventos" element={<Events />} />
          <Route path="/evento/:id" element={<EventPage />} />
          <Route path="/cinturoes" element={<Titles />} />
          <Route path="/modelo" element={<About />} />
          <Route path="*" element={<div className="container empty"><h2>Página não encontrada</h2><p style={{ marginTop: 12 }}><Link to="/" className="btn btn-outline">Voltar ao início</Link></p></div>} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="container">
          <span>DadosUFC · uso pessoal · estatísticas somente de lutas no UFC</span>
          <span>
            Dados: UFCStats · fotos e calendário: ESPN
            {meta ? ` · atualizado em ${fmtDate(meta.generatedAt.slice(0, 10))}` : ''}
            {pwa.available && <> · <button className="link-btn" onClick={pwa.install}>Instalar app</button></>}
            {` · versão ${__BUILD__.sha} (${new Date(__BUILD__.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`}
          </span>
        </div>
      </footer>
      {moreOpen && <div className="more-backdrop" onClick={() => setMoreOpen(false)} />}
      {moreOpen && (
        <div className="more-sheet" role="menu">
          {pwa.available && (
            <button className="more-install" role="menuitem" onClick={() => { setMoreOpen(false); pwa.install(); }}>
              <Icon name="up" />
              Instalar app
            </button>
          )}
          {MOBILE_MORE.map((n) => (
            <NavLink key={n.to} to={n.to} role="menuitem">
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
      <nav className="bottom-nav" aria-label="Navegação">
        {NAV.filter((n) => MOBILE_MAIN.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <button className={`more-btn ${moreActive || moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          <Icon name="more" />
          Mais
        </button>
      </nav>
    </>
  );
}
