import { useSearchParams } from 'react-router-dom';
import { DivisionCard, P4PCard } from '../components/OfficialCards';
import RankTabs from '../components/RankTabs';
import { ErrorBox, Loading } from '../components/ui';
import { useOfficialBoard } from '../lib/data';
import { fmtDate } from '../lib/format';

/** Ranking oficial do UFC: pound-for-pound e as categorias (campeão + top 15). */
export default function OfficialRanking() {
  const { data: board, error } = useOfficialBoard();
  const [params, setParams] = useSearchParams();
  const gender = params.get('genero') === 'f' ? 'f' : params.get('genero') === 'm' ? 'm' : '';
  const set = (v: string) => { const p = new URLSearchParams(params); if (v) p.set('genero', v); else p.delete('genero'); setParams(p, { replace: true }); };
  if (error) return <div className="container"><ErrorBox message={error} /></div>;
  if (!board) return <Loading />;
  const groups = [{ women: false, label: 'Masculino' }, { women: true, label: 'Feminino' }].filter((g) => !gender || (gender === 'f') === g.women);
  return (
    <div className="container">
      <div className="page-head">
        <span className="eyebrow">Ranking</span>
        <h1 style={{ marginTop: 8 }}>Ranking oficial do UFC</h1>
        <p>Campeão e top 15 de cada categoria (Meta UFC Rankings{board.released ? `, divulgado em ${fmtDate(board.released)}` : ''}) e o pound-for-pound{board.p4p.released ? ` (painel de mídia, ${fmtDate(board.p4p.released)})` : ''}. O peso ao lado do nome é o do lutador, em kg e (lbs).</p>
      </div>
      <div className="filters" style={{ marginBottom: 10 }}><RankTabs /></div>
      <div className="filters">
        <div className="seg" role="group" aria-label="Gênero">
          {[['', 'Todos'], ['m', 'Masculino'], ['f', 'Feminino']].map(([v, l]) => <button key={v} className={gender === v ? 'on' : ''} onClick={() => set(v)}>{l}</button>)}
        </div>
      </div>
      {groups.map((g) => {
        const divs = board.divisions.filter((d) => d.women === g.women);
        const p4p = g.women ? board.p4p.women : board.p4p.men;
        return (
          <div key={g.label} className="rk-group">
            <div className="rk-group-title">{g.label}</div>
            <div className="rk-grid rk-full">
              {p4p.length > 0 && <P4PCard title="Pound for pound" rows={p4p} />}
              {divs.map((d) => <DivisionCard key={d.key} d={d} top={15} link={false} />)}
            </div>
          </div>
        );
      })}
      <p className="note" style={{ marginTop: 18 }}>
        O ufc.com bloqueia acesso automatizado, então o ranking é lido da Wikipédia, que cita a página oficial a cada divulgação; pode haver um atraso de alguns dias. Desde 20/06/2026 as categorias seguem o Meta UFC Rankings (modelo baseado em Elo), que não tem pound-for-pound; por isso o pound-for-pound mostrado vem do painel de mídia, que continua sendo publicado no período de transição. Só aparecem com link os lutadores que têm página no site.
      </p>
    </div>
  );
}
