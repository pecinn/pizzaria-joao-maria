import { useEffect, useState } from 'react';
import {
  api, brl, carrinhoSalvo, registrarPedido, salvarCarrinho,
  type Cardapio, type ConfigLoja, type LinhaCarrinho, type Pedido,
} from './api';
import TelaCardapio from './pages/Cardapio';
import Checkout from './pages/Checkout';
import Acompanhar from './pages/Acompanhar';

type Tela = 'cardapio' | 'checkout' | 'acompanhar';

/** Permite abrir direto no acompanhamento: /?pedido=JM-0000 */
const codigoDaUrl = new URLSearchParams(window.location.search).get('pedido');

export default function App() {
  const [tela, setTela] = useState<Tela>(codigoDaUrl ? 'acompanhar' : 'cardapio');
  const [config, setConfig] = useState<ConfigLoja | null>(null);
  const [cardapio, setCardapio] = useState<Cardapio | null>(null);
  const [carrinho, setCarrinho] = useState<LinhaCarrinho[]>(carrinhoSalvo);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [codigoAtual, setCodigoAtual] = useState<string | null>(codigoDaUrl);
  const [recemCriado, setRecemCriado] = useState(false);

  useEffect(() => {
    Promise.all([api.get<ConfigLoja>('/config'), api.get<Cardapio>('/cardapio')])
      .then(([c, m]) => { setConfig(c); setCardapio(m); })
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { salvarCarrinho(carrinho); }, [carrinho]);

  const adicionar = (linha: Omit<LinhaCarrinho, 'quantidade'>) =>
    setCarrinho(c => c.some(l => l.chave === linha.chave)
      ? c.map(l => l.chave === linha.chave ? { ...l, quantidade: l.quantidade + 1 } : l)
      : [...c, { ...linha, quantidade: 1 }]);

  const alterarQuantidade = (chave: string, delta: number) =>
    setCarrinho(c => c
      .map(l => l.chave === chave ? { ...l, quantidade: l.quantidade + delta } : l)
      .filter(l => l.quantidade > 0));

  const quantidadeNoCarrinho = (chave: string) =>
    carrinho.find(l => l.chave === chave)?.quantidade ?? 0;

  const itens = carrinho.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = carrinho.reduce((s, l) => s + l.preco * l.quantidade, 0);

  const aoConfirmar = (pedido: Pedido) => {
    registrarPedido(pedido.codigo);
    setCodigoAtual(pedido.codigo);
    setRecemCriado(true);
    setCarrinho([]);
    setTela('acompanhar');
    // Abre o WhatsApp da pizzaria já com o pedido escrito.
    window.open(pedido.whatsapp_loja, '_blank', 'noopener');
  };

  return (
    <>
      <header className="topo">
        <div className="topo-linha">
          <div>
            <div className="marca"><span>🍕</span> {config?.nome ?? 'Pizzaria João & Maria'}</div>
            <div className="topo-info">
              {config && (
                <>
                  <span className={`selo ${config.aberta ? '' : 'fechada'}`}>
                    <span className={`ponto ${config.aberta ? '' : 'off'}`} />
                    {config.aberta ? 'Aberto agora' : 'Fechado'}
                  </span>
                  <span>Entrega {brl(config.taxa_entrega)}</span>
                  <span>~{config.tempo_preparo_min + config.tempo_entrega_min} min</span>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="abas">
          <button className={tela === 'cardapio' ? 'ativa' : ''} onClick={() => setTela('cardapio')}>
            Cardápio
          </button>
          <button className={tela === 'checkout' ? 'ativa' : ''} onClick={() => setTela('checkout')}>
            Carrinho{itens > 0 ? ` (${itens})` : ''}
          </button>
          <button className={tela === 'acompanhar' ? 'ativa' : ''}
            onClick={() => { setRecemCriado(false); setTela('acompanhar'); }}>
            Meu pedido
          </button>
        </nav>
      </header>

      <main className="pagina">
        {config && !config.aberta && tela === 'cardapio' && (
          <div className="aviso info">
            Estamos fechados agora. Horário de funcionamento: {config.horario_funcionamento}.
          </div>
        )}

        {tela === 'cardapio' && (
          <TelaCardapio cardapio={cardapio} carregando={carregando} erro={erro}
            adicionar={adicionar} quantidadeNoCarrinho={quantidadeNoCarrinho} />
        )}

        {tela === 'checkout' && config && (
          <Checkout carrinho={carrinho} config={config} alterarQuantidade={alterarQuantidade}
            aoConfirmar={aoConfirmar} voltarAoCardapio={() => setTela('cardapio')} />
        )}

        {tela === 'acompanhar' && config && (
          <Acompanhar codigoInicial={codigoAtual} config={config} recemCriado={recemCriado}
            voltarAoCardapio={() => { setRecemCriado(false); setTela('cardapio'); }} />
        )}

        {config && (
          <p className="rodape">
            {config.endereco}<br />{config.horario_funcionamento}
          </p>
        )}
      </main>

      {itens > 0 && tela === 'cardapio' && (
        <div className="barra-carrinho">
          <div className="interno">
            <div className="resumo">
              <div className="qtd">{itens} {itens === 1 ? 'item' : 'itens'}</div>
              <div className="total">{brl(subtotal)}</div>
            </div>
            <button className="btn" onClick={() => setTela('checkout')}>Ver carrinho</button>
          </div>
        </div>
      )}
    </>
  );
}
