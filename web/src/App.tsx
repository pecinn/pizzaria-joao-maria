import { useEffect, useState } from 'react';
import { api, type ResumoDelivery } from './api';
import PainelInicial from './pages/Painel';
import Estoque from './pages/Estoque';
import Compras from './pages/Compras';
import ProducaoCustos from './pages/Producao';
import Cardapio from './pages/Cardapio';
import Vendas from './pages/Vendas';
import FechamentoDiario from './pages/Fechamento';
import Relatorios from './pages/Relatorios';
import Cadastros from './pages/Cadastros';
import Delivery from './pages/Delivery';

const MENU = [
  { grupo: 'Operação', itens: [
    { id: 'painel', rotulo: 'Painel' },
    { id: 'estoque', rotulo: 'Posição de estoque' },
    { id: 'compras', rotulo: 'Compras e reposição' },
    { id: 'delivery', rotulo: 'Delivery' },
    { id: 'vendas', rotulo: 'Vendas (balcão)' },
    { id: 'fechamento', rotulo: 'Fechamento diário' },
  ] },
  { grupo: 'Produção', itens: [
    { id: 'producao', rotulo: 'Produção e custos' },
    { id: 'cardapio', rotulo: 'Cardápio e fichas' },
  ] },
  { grupo: 'Gestão', itens: [
    { id: 'relatorios', rotulo: 'Relatórios' },
    { id: 'cadastros', rotulo: 'Cadastros' },
  ] },
];

/** Navegação por hash: a URL identifica a tela e sobrevive ao recarregar. */
function usePagina(): [string, (p: string) => void] {
  const ler = () => window.location.hash.replace('#/', '') || 'painel';
  const [pagina, setPagina] = useState(ler);
  useEffect(() => {
    const aoMudar = () => setPagina(ler());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return [pagina, (p: string) => { window.location.hash = '#/' + p; setPagina(p); }];
}

export default function App() {
  const [pagina, setPagina] = usePagina();
  const [emAberto, setEmAberto] = useState(0);

  // Contador de pedidos do app aguardando atendimento, visível em qualquer tela.
  useEffect(() => {
    const buscar = () => api.get<ResumoDelivery>('/delivery/resumo')
      .then(r => setEmAberto(r.em_aberto)).catch(() => {});
    buscar();
    const t = setInterval(buscar, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="app">
      <nav className="menu">
        <h1>Pizzaria João &amp; Maria</h1>
        <p className="sub">Gestão de estoque e produção</p>
        {MENU.map(g => (
          <div key={g.grupo}>
            <div className="grupo">{g.grupo}</div>
            {g.itens.map(i => (
              <button key={i.id} className={pagina === i.id ? 'ativo' : ''} onClick={() => setPagina(i.id)}>
                {i.rotulo}
                {i.id === 'delivery' && emAberto > 0 && <span className="contador-menu">{emAberto}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="conteudo">
        {pagina === 'painel' && <PainelInicial ir={setPagina} />}
        {pagina === 'estoque' && <Estoque />}
        {pagina === 'compras' && <Compras />}
        {pagina === 'delivery' && <Delivery />}
        {pagina === 'vendas' && <Vendas />}
        {pagina === 'fechamento' && <FechamentoDiario />}
        {pagina === 'producao' && <ProducaoCustos />}
        {pagina === 'cardapio' && <Cardapio />}
        {pagina === 'relatorios' && <Relatorios />}
        {pagina === 'cadastros' && <Cadastros />}
      </main>
    </div>
  );
}
