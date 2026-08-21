import { useCallback, useEffect, useState } from 'react';
import {
  api, brl, ETAPAS, hora, meusPedidos, ROTULO_STATUS,
  type ConfigLoja, type Pedido,
} from '../api';

interface Props {
  codigoInicial: string | null;
  config: ConfigLoja;
  recemCriado: boolean;
  voltarAoCardapio: () => void;
}

export default function Acompanhar({ codigoInicial, config, recemCriado, voltarAoCardapio }: Props) {
  const [codigo, setCodigo] = useState(codigoInicial ?? meusPedidos()[0] ?? '');
  const [busca, setBusca] = useState(codigo);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const buscar = useCallback(async (cod: string) => {
    if (!cod) return;
    setCarregando(true);
    try {
      setPedido(await api.get<Pedido>(`/pedidos/${cod.trim().toUpperCase()}`));
      setErro(null);
    } catch (e: any) {
      setErro(e.message);
      setPedido(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(codigo); }, [codigo, buscar]);

  // Enquanto o pedido está em andamento, atualiza sozinho a cada 20 segundos.
  useEffect(() => {
    if (!pedido || ['ENTREGUE', 'CANCELADO'].includes(pedido.status_preparo)) return;
    const t = setInterval(() => buscar(pedido.codigo), 20000);
    return () => clearInterval(t);
  }, [pedido, buscar]);

  const historicoPor = new Map((pedido?.historico ?? []).map(h => [h.status, h.data_hora]));
  const indiceAtual = pedido ? ETAPAS.indexOf(pedido.status_preparo as any) : -1;
  const cancelado = pedido?.status_preparo === 'CANCELADO';

  return (
    <>
      {recemCriado && pedido && (
        <div className="aviso ok">
          Pedido enviado! Guarde o código <strong>{pedido.codigo}</strong> para acompanhar.
        </div>
      )}

      <div className="cartao">
        <label>Código do pedido</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={busca} placeholder="JM-0000"
            onChange={e => setBusca(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && setCodigo(busca)} />
          <button className="btn" onClick={() => setCodigo(busca)} disabled={!busca.trim()}>Buscar</button>
        </div>
        {meusPedidos().length > 1 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {meusPedidos().map(c => (
              <button key={c} className="btn claro pequeno"
                onClick={() => { setBusca(c); setCodigo(c); }}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {carregando && !pedido && <div className="vazio">Buscando…</div>}
      {erro && <div className="aviso erro">{erro}</div>}

      {pedido && (
        <>
          <div className="cartao">
            <div className="codigo-pedido">{pedido.codigo}</div>
            <div style={{ textAlign: 'center', color: 'var(--suave)', fontSize: 13 }}>
              {pedido.tipo_atendimento === 'DELIVERY' ? 'Entrega' : 'Retirada no balcão'}
              {' · '}feito às {hora(pedido.data_hora)}
            </div>

            {cancelado ? (
              <div className="aviso erro" style={{ marginTop: 16, marginBottom: 0 }}>
                Este pedido foi cancelado. Fale com a pizzaria pelo WhatsApp.
              </div>
            ) : (
              <div className="trilha">
                {ETAPAS
                  .filter(e => pedido.tipo_atendimento === 'DELIVERY' || e !== 'SAIU_ENTREGA')
                  .map((etapa, i, lista) => {
                    const posicao = ETAPAS.indexOf(etapa);
                    const feita = posicao <= indiceAtual;
                    const atual = posicao === indiceAtual;
                    return (
                      <div key={etapa} className={`etapa ${feita ? 'feita' : ''} ${atual ? 'atual' : ''}`}>
                        <div className="marcador">
                          <div className="bola">✓</div>
                          {i < lista.length - 1 && <div className="traco" />}
                        </div>
                        <div className="rotulo">
                          <strong>{ROTULO_STATUS[etapa]}</strong>
                          <small>
                            {historicoPor.has(etapa)
                              ? hora(historicoPor.get(etapa)!)
                              : atual ? 'agora' : '—'}
                          </small>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {!cancelado && pedido.status_preparo !== 'ENTREGUE' && (
              <div style={{ textAlign: 'center', color: 'var(--suave)', fontSize: 13 }}>
                Previsão: cerca de {pedido.previsao_minutos} minutos a partir do pedido.
              </div>
            )}
          </div>

          <div className="cartao">
            <h3>Itens</h3>
            {pedido.itens.map((i, k) => (
              <div className="linha-carrinho" key={k}>
                <div className="info">
                  <div className="nome">{i.quantidade}x {i.descricao}</div>
                </div>
                <div style={{ fontWeight: 600 }}>{brl(i.quantidade * i.preco_praticado)}</div>
              </div>
            ))}
            <div className="totais" style={{ marginTop: 12 }}>
              <div><span>Subtotal</span><span>{brl(pedido.subtotal)}</span></div>
              <div><span>Taxa de entrega</span><span>{brl(pedido.taxa_entrega)}</span></div>
              <div className="final"><span>Total</span><span>{brl(pedido.total)}</span></div>
            </div>
            {pedido.endereco_entrega && (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--suave)' }}>
                Entregar em: {pedido.endereco_entrega}
                {pedido.complemento ? `, ${pedido.complemento}` : ''}
              </div>
            )}
          </div>

          <a className="btn zap bloco" href={pedido.whatsapp_loja} target="_blank" rel="noreferrer">
            Enviar este pedido no WhatsApp da pizzaria
          </a>
          <p style={{ fontSize: 12.5, color: 'var(--suave)', textAlign: 'center', margin: '10px 0 0' }}>
            O pedido já chegou no sistema da pizzaria. O WhatsApp é o canal para
            confirmar, tirar dúvidas ou pedir alguma alteração.
          </p>

          <div style={{ marginTop: 16 }}>
            <button className="btn claro bloco" onClick={voltarAoCardapio}>Fazer outro pedido</button>
          </div>
        </>
      )}

      {!pedido && !carregando && !erro && (
        <div className="vazio">
          <span className="emoji">🔎</span>
          Digite o código do seu pedido para acompanhar.
          <div style={{ fontSize: 12, marginTop: 8 }}>
            {config.horario_funcionamento}
          </div>
        </div>
      )}
    </>
  );
}
