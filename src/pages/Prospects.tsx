import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import FavButton from '../components/FavButton';
import { Avatar, ErrorBox, Flag, Loading } from '../components/ui';
import { useFighters } from '../lib/data';
import { recordStr } from '../lib/format';
import { DIVISION_BY_KEY, MAIN_DIVISIONS } from '../shared/divisions';

export default function Prospects() {
  const { data, error } = useFighters();
  const [div, setDiv] = useState('');
  const [onlyNext, setOnlyNext] = useState(false);
  const list = useMemo(
    () => (data ?? []).filter((f) => f.prospect && (!div || f.division === div) && (!onlyNext || f.upcoming)).sort((a, b) => a.prospect!.rank - b.prospect!.rank),
    [data, div, onlyNext],
  );
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!data) return <Loading />;
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Para assistir</span>
        <h1>Prospectos</h1>
        <p>Lutadores com até 5 lutas no UFC, quase sempre invictos, com números muito acima da média e vitórias que terminam antes da decisão: nocaute ou finalização.</p>
      </div>
      <div className="filters">
        <select value={div} onChange={(e) => setDiv(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {MAIN_DIVISIONS.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}
        </select>
        <label className="chip" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyNext} onChange={(e) => setOnlyNext(e.target.checked)} /> Só com luta marcada
        </label>
      </div>
      <div className="prospect-list">
        {list.map((f) => (
          <article className="prospect-card" key={f.id}>
            <div className="prospect-rank"><b>{f.prospect!.rank}</b><span>#</span></div>
            <Avatar name={f.name} id={f.id} />
            <div className="prospect-body">
              <div className="prospect-top">
                <Link to={`/lutador/${f.slug}`} className="name"><Flag src={f.flag} country={f.country} /> {f.name}</Link>
                <FavButton kind="fighters" id={f.id} name={f.name} />
              </div>
              <div className="meta">
                <span className="chip chip-record">UFC {recordStr(f.record)}</span>
                <span className="chip">{DIVISION_BY_KEY[f.division]?.short ?? f.division}</span>
                {f.upcoming && <span className="chip chip-up">Próxima luta</span>}
              </div>
              <div className="meta">{f.prospect!.tags.map((t) => <span key={t} className="chip chip-style">{t}</span>)}</div>
              <ul className="prospect-why">{f.prospect!.why.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
            <div className="prospect-score" title="Nota de 0 a 100 do quanto o lutador é interessante de assistir"><b>{f.prospect!.score}</b><span>nota</span></div>
          </article>
        ))}
        {!list.length && <p className="note">Nenhum prospecto com esses filtros.</p>}
      </div>
      <details className="panel" style={{ marginTop: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Como a nota é calculada</summary>
        <p className="note" style={{ marginTop: 10, lineHeight: 1.7 }}>
          Entram lutadores ativos com 1 a 5 lutas no UFC que cumpram todos os requisitos: pelo menos 75% das vitórias antes da decisão,
          no máximo 1 em 4 lutas decidida pelos juízes, nenhuma derrota (uma derrota só é aceita com 3 ou mais vitórias, todas antes da decisão) e nota mínima de 55.
          A nota (0 a 100) soma finalização (28%, vitórias que não foram para os juízes), ofensiva (24%, golpes, knockdowns, finalizações e quedas comparados ao resto do UFC),
          versatilidade (14%, bom em pé e no chão), rapidez (14%), domínio (12%, absorve pouco e defende bem) e nível dos adversários batidos (8%).
          Derrotas e decisões tiram pontos, e poucos minutos de luta puxam a nota para baixo. É um retrato do que já aconteceu, não uma previsão de carreira.
        </p>
      </details>
    </div>
  );
}
