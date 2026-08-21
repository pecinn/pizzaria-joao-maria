import { useState } from 'react';
import {
  api, brl, clienteSalvo, mascararTelefone, salvarCliente,
  type ConfigLoja, type LinhaCarrinho, type Pedido,
} from '../api';

interface Props {
  carrinho: LinhaCarrinho[];
  config: ConfigLoja;
  alterarQuantidade: (chave: string, delta: number) => void;
  aoConfirmar: (pedido: Pedido) => void;
  voltarAoCardapio: () => void;
}

const PAGAMENTOS = [
  ['PIX', 'PIX'], ['DINHEIRO', 'Dinheiro'],
  ['DEBITO', 'Débito'], ['CREDITO', 'Crédito'],
] as const;

export default function Checkout({ carrinho, config, alterarQuantidade, aoConfirmar, voltarAoCardapio }: Props) {
  const salvo = clienteSalvo();
  const [nome, setNome] = useState(salvo.nome ?? '');
  const [telefone, setTelefone] = useState(salvo.telefone ?? '');
  const [entrega, setEntrega] = useState(true);
  const [endereco, setEndereco] = useState(salvo.endereco_entrega ?? '');
  const [complemento, setComplemento] = useState(salvo.complemento ?? '');
  const [referencia, setReferencia] = useState(salvo.referencia ?? '');
  const [pagamento, setPagamento] = useState<string>('PIX');
  const [trocoPara, setTrocoPara] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const subtotal = carrinho.reduce((s, l) => s + l.preco * l.quantidade, 0);
  const taxa = entrega ? config.taxa_entrega : 0;
  const total = subtotal + taxa;
  const faltaParaMinimo = entrega ? config.pedido_minimo - subtotal : 0;

  if (!carrinho.length) {
    return (
      <div className="vazio">
        <span className="emoji">🍕</span>
        Seu carrinho está vazio.
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={voltarAoCardapio}>Ver o cardápio</button>
        </div>
      </div>
    );
  }

  const enviar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      const pedido = await api.post<Pedido>('/pedidos', {
        cliente_nome: nome,
        telefone,
        tipo_atendimento: entrega ? 'DELIVERY' : 'BALCAO',
        forma_pagamento: pagamento,
        endereco_entrega: entrega ? endereco : undefined,
        complemento: entrega ? complemento : undefined,
        referencia: entrega ? referencia : undefined,
        observacao: observacao || undefined,
        troco_para: pagamento === 'DINHEIRO' && trocoPara ? Number(trocoPara) : undefined,
        itens: carrinho.map(l => l.item_id
          ? { item_id: l.item_id, quantidade: l.quantidade }
          : { produto_id: l.produto_id, tamanho_id: l.tamanho_id, quantidade: l.quantidade }),
      });
      salvarCliente({ nome, telefone, endereco_entrega: endereco, complemento, referencia });
      aoConfirmar(pedido);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const podeEnviar = nome.trim().length > 2
    && telefone.replace(/\D/g, '').length >= 10
    && (!entrega || endereco.trim().length > 5)
    && (!entrega || faltaParaMinimo <= 0)
    && !enviando;

  return (
    <>
      {erro && <div className="aviso erro">{erro}</div>}

      <div className="cartao">
        <h3>Seu pedido</h3>
        {carrinho.map(l => (
          <div className="linha-carrinho" key={l.chave}>
            <div className="info">
              <div className="nome">{l.descricao}</div>
              <div className="sub">{l.detalhe} · {brl(l.preco)} cada</div>
            </div>
            <div className="contador">
              <button onClick={() => alterarQuantidade(l.chave, -1)} aria-label="menos">−</button>
              <span>{l.quantidade}</span>
              <button onClick={() => alterarQuantidade(l.chave, +1)} aria-label="mais">+</button>
            </div>
            <div style={{ fontWeight: 600, minWidth: 74, textAlign: 'right' }}>
              {brl(l.preco * l.quantidade)}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <button className="btn claro pequeno" onClick={voltarAoCardapio}>+ adicionar mais itens</button>
        </div>
      </div>

      <div className="cartao">
        <h3>Como você quer receber</h3>
        <div className="opcoes" style={{ marginBottom: 14 }}>
          <button className={`opcao ${entrega ? 'ativa' : ''}`} onClick={() => setEntrega(true)}>
            🛵 Entrega<br /><small>{brl(config.taxa_entrega)} · {config.tempo_preparo_min + config.tempo_entrega_min} min</small>
          </button>
          <button className={`opcao ${!entrega ? 'ativa' : ''}`} onClick={() => setEntrega(false)}>
            🏠 Retirar<br /><small>sem taxa · {config.tempo_preparo_min} min</small>
          </button>
        </div>

        <div className="campo">
          <label>Seu nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome e sobrenome" />
        </div>
        <div className="campo">
          <label>WhatsApp (é por onde avisamos do pedido)</label>
          <input value={telefone} inputMode="tel" placeholder="(67) 99999-0000"
            onChange={e => setTelefone(mascararTelefone(e.target.value))} />
        </div>

        {entrega ? (
          <>
            <div className="campo">
              <label>Endereço de entrega</label>
              <input value={endereco} onChange={e => setEndereco(e.target.value)}
                placeholder="Rua, número e bairro" />
            </div>
            <div className="dupla">
              <div className="campo">
                <label>Complemento</label>
                <input value={complemento} onChange={e => setComplemento(e.target.value)}
                  placeholder="Apto, bloco" />
              </div>
              <div className="campo">
                <label>Referência</label>
                <input value={referencia} onChange={e => setReferencia(e.target.value)}
                  placeholder="Perto de…" />
              </div>
            </div>
          </>
        ) : (
          <div className="aviso info" style={{ marginBottom: 0 }}>
            Retirada em {config.endereco}
          </div>
        )}
      </div>

      <div className="cartao">
        <h3>Pagamento</h3>
        <div className="opcoes">
          {PAGAMENTOS.map(([valor, rotulo]) => (
            <button key={valor} className={`opcao ${pagamento === valor ? 'ativa' : ''}`}
              onClick={() => setPagamento(valor)}>{rotulo}</button>
          ))}
        </div>
        {pagamento === 'DINHEIRO' && (
          <div className="campo" style={{ marginTop: 12 }}>
            <label>Precisa de troco para quanto?</label>
            <input type="number" inputMode="decimal" value={trocoPara} placeholder="deixe vazio se não precisar"
              onChange={e => setTrocoPara(e.target.value)} />
            {!!trocoPara && Number(trocoPara) >= total && (
              <div style={{ fontSize: 12, color: 'var(--suave)', marginTop: 5 }}>
                O entregador leva {brl(Number(trocoPara) - total)} de troco.
              </div>
            )}
          </div>
        )}
        <div className="campo" style={{ marginTop: 12, marginBottom: 0 }}>
          <label>Observações</label>
          <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)}
            placeholder="Ex.: sem cebola, campainha quebrada…" />
        </div>
      </div>

      <div className="cartao">
        <div className="totais">
          <div><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          <div><span>Taxa de entrega</span><span>{entrega ? brl(taxa) : 'grátis'}</span></div>
          <div className="final"><span>Total</span><span>{brl(total)}</span></div>
        </div>
      </div>

      {faltaParaMinimo > 0 && (
        <div className="aviso info">
          Faltam <strong>{brl(faltaParaMinimo)}</strong> para atingir o pedido mínimo de
          {' '}{brl(config.pedido_minimo)} na entrega.
        </div>
      )}

      <button className="btn bloco" onClick={enviar} disabled={!podeEnviar}>
        {enviando ? 'Enviando…' : `Fazer pedido · ${brl(total)}`}
      </button>
    </>
  );
}
