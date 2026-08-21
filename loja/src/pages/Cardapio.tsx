import { brl, type BebidaCardapio, type Cardapio, type LinhaCarrinho, type Sabor } from '../api';

interface Props {
  cardapio: Cardapio | null;
  carregando: boolean;
  erro: string | null;
  adicionar: (linha: Omit<LinhaCarrinho, 'quantidade'>) => void;
  quantidadeNoCarrinho: (chave: string) => number;
}

export default function TelaCardapio({ cardapio, carregando, erro, adicionar, quantidadeNoCarrinho }: Props) {
  if (carregando) return <div className="vazio">Carregando o cardápio…</div>;
  if (erro) return <div className="aviso erro">{erro}</div>;
  if (!cardapio) return null;

  const salgadas = cardapio.sabores.filter(s => s.categoria === 'SALGADA');
  const doces = cardapio.sabores.filter(s => s.categoria === 'DOCE');

  return (
    <>
      {!!salgadas.length && <div className="titulo-secao">Pizzas salgadas</div>}
      {salgadas.map(s => (
        <CartaoSabor key={s.produto_id} sabor={s} adicionar={adicionar} contar={quantidadeNoCarrinho} />
      ))}

      {!!doces.length && <div className="titulo-secao">Pizzas doces</div>}
      {doces.map(s => (
        <CartaoSabor key={s.produto_id} sabor={s} adicionar={adicionar} contar={quantidadeNoCarrinho} />
      ))}

      {!!cardapio.bebidas.length && <div className="titulo-secao">Bebidas</div>}
      {cardapio.bebidas.map(b => (
        <CartaoBebida key={b.item_id} bebida={b} adicionar={adicionar} contar={quantidadeNoCarrinho} />
      ))}
    </>
  );
}

function CartaoSabor({ sabor, adicionar, contar }: {
  sabor: Sabor;
  adicionar: Props['adicionar'];
  contar: (chave: string) => number;
}) {
  return (
    <div className="sabor">
      <h3>{sabor.produto}</h3>
      {sabor.descricao && <p className="desc">{sabor.descricao}</p>}
      <div className="tamanhos">
        {sabor.tamanhos.map(t => {
          const chave = `p:${sabor.produto_id}:${t.tamanho_id}`;
          const noCarrinho = contar(chave);
          return (
            <button key={t.tamanho_id} className="tamanho" disabled={!t.disponivel}
              onClick={() => adicionar({
                chave,
                descricao: `${sabor.produto} ${t.tamanho}`,
                detalhe: `${t.numero_fatias} fatias`,
                preco: t.preco,
                produto_id: sabor.produto_id,
                tamanho_id: t.tamanho_id,
              })}>
              <span className="nome">
                {t.tamanho}
                <span className="fatias">
                  {t.disponivel ? `${t.numero_fatias} fatias` : <span className="esgotado">esgotado hoje</span>}
                </span>
              </span>
              <span className="preco">
                {brl(t.preco)}
                {noCarrinho > 0 && <span className="fatias">{noCarrinho} no carrinho</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CartaoBebida({ bebida, adicionar, contar }: {
  bebida: BebidaCardapio;
  adicionar: Props['adicionar'];
  contar: (chave: string) => number;
}) {
  const chave = `i:${bebida.item_id}`;
  const noCarrinho = contar(chave);
  const disponivel = !!bebida.disponivel;

  return (
    <div className="bebida">
      <div>
        <div style={{ fontWeight: 600 }}>{bebida.item_nome}</div>
        <div style={{ fontSize: 12, color: 'var(--suave)' }}>
          {disponivel ? brl(bebida.preco) : <span className="esgotado">esgotado</span>}
          {noCarrinho > 0 && ` · ${noCarrinho} no carrinho`}
        </div>
      </div>
      <button className="btn add" disabled={!disponivel}
        onClick={() => adicionar({
          chave, descricao: bebida.item_nome, detalhe: 'bebida',
          preco: bebida.preco, item_id: bebida.item_id,
        })}>+</button>
    </div>
  );
}
