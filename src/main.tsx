import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/roboto-mono/700.css';
import './styles/global.css';
import './styles/motion.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App';

// atualização automática: procura versão nova ao abrir, ao voltar para a aba e a cada 2 min;
// quando há, a página recarrega sozinha (sem precisar de F5 repetido)
registerSW({
  immediate: true,
  onRegisteredSW(_url, r) {
    if (!r) return;
    const check = () => r.update().catch(() => {});
    setInterval(check, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
