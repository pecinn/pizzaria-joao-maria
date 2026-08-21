import { useState } from 'react';
import { api, num, type Fornecedor, type Item, type TipoItem, type Unidade } from '../api';
import { Campo, Estado, Mensagem, Painel, Tag, useApi } from '../components/ui';

export default function Cadastros() {
  const itens = useApi<Item[]>('/itens?incluir_inativos=true');
  const fornecedores = useApi<Fornecedor[]>('/fornecedores?incluir_inativos=true');
  const unidades = useApi<Unidade[]>('/unidades');

  return (
    <>
      <h2>Cadastros</h2>
      <p className="desc">
        Itens, fornecedores e unidades. Registros não são excluídos — apenas inativados,
        preservando o histórico (RN14).
      </p>

      <FormItem unidades={unidades.dados ?? []} aoSalvar={itens.recarregar} />

      <Painel titulo="Itens" rn="RF02 / RN01 / RN04">
        <Estado carregando={itens.carregando} erro={itens.erro} vazio={!itens.dados?.length}>
          <table>
            <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Unid.</th>
              <th className="num">Aproveit.</th><th className="num">Mínimo</th><th className="num">Máximo</th>
              <th>Vendável</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {itens.dados?.map(i => (
                <tr key={i.id} style={{ opacity: i.ativo ? 1 : .5 }}>
                  <td><code>{i.codigo}</code></td>
                  <td>{i.nome}</td>
                  <td><Tag tipo="neutro">{i.tipo}</Tag></td>
                  <td>{i.unidade}</td>
                  <td className="num">{num(i.perc_aproveitamento, 0)}%</td>
                  <td className="num">{num(i.estoque_minimo, 0)}</td>
                  <td className="num">{num(i.estoque_maximo, 0)}</td>
                  <td>{i.vendavel ? <Tag tipo="ok">sim</Tag> : '—'}</td>
                  <td>{i.ativo ? <Tag tipo="ok">ativo</Tag> : <Tag tipo="neutro">inativo</Tag>}</td>
                  <td>
                    {!!i.ativo && (
                      <button className="acao secundario mini" onClick={async () => {
                        await api.del(`/itens/${i.id}`); itens.recarregar();
                      }}>inativar</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      <FormFornecedor aoSalvar={fornecedores.recarregar} />

      <Painel titulo="Fornecedores" rn="RF01 / RN14">
        <Estado carregando={fornecedores.carregando} erro={fornecedores.erro} vazio={!fornecedores.dados?.length}>
          <table>
            <thead><tr><th>CNPJ</th><th>Razão social</th><th>Nome fantasia</th>
              <th>Contato</th><th>Telefone</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {fornecedores.dados?.map(f => (
                <tr key={f.id} style={{ opacity: f.ativo ? 1 : .5 }}>
                  <td><code>{f.cnpj}</code></td>
                  <td>{f.razao_social}</td>
                  <td>{f.nome_fantasia ?? '—'}</td>
                  <td>{f.contato ?? '—'}</td>
                  <td>{f.telefone ?? '—'}</td>
                  <td>{f.ativo ? <Tag tipo="ok">ativo</Tag> : <Tag tipo="neutro">inativo</Tag>}</td>
                  <td>
                    {!!f.ativo && (
                      <button className="acao secundario mini" onClick={async () => {
                        await api.del(`/fornecedores/${f.id}`); fornecedores.recarregar();
                      }}>inativar</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      <Painel titulo="Unidades de medida" rn="RF03 / RN03">
        <Estado carregando={unidades.carregando} erro={unidades.erro} vazio={!unidades.dados?.length}>
          <table>
            <thead><tr><th>Sigla</th><th>Descrição</th><th>Tipo</th></tr></thead>
            <tbody>
              {unidades.dados?.map(u => (
                <tr key={u.id}><td><code>{u.sigla}</code></td><td>{u.descricao}</td>
                  <td><Tag tipo="neutro">{u.tipo}</Tag></td></tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}

function FormItem({ unidades, aoSalvar }: { unidades: Unidade[]; aoSalvar: () => void }) {
  const vazio = {
    codigo: '', nome: '', tipo: 'INSUMO' as TipoItem, unidade_padrao_id: '' as number | '',
    perc_aproveitamento: '100', estoque_minimo: '0', estoque_maximo: '0', vendavel: false,
  };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const insumo = f.tipo === 'INSUMO';

  const enviar = async () => {
    setErro(null); setOk(null);
    try {
      await api.post('/itens', {
        ...f,
        perc_aproveitamento: insumo ? Number(f.perc_aproveitamento) : 100,
        estoque_minimo: Number(f.estoque_minimo),
        estoque_maximo: Number(f.estoque_maximo),
      });
      setOk(`Item "${f.nome}" cadastrado.`); setF(vazio); aoSalvar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <Painel titulo="Novo item" rn="RF02">
      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />
      <div className="form">
        <Campo rotulo="Código"><input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} /></Campo>
        <Campo rotulo="Nome"><input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Tipo">
          <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as TipoItem })}>
            <option value="INSUMO">Insumo</option>
            <option value="BEBIDA">Bebida</option>
            <option value="EMBALAGEM">Embalagem</option>
            <option value="DESCARTAVEL">Descartável</option>
          </select>
        </Campo>
        <Campo rotulo="Unidade de controle">
          <select value={f.unidade_padrao_id} onChange={e => setF({ ...f, unidade_padrao_id: Number(e.target.value) })}>
            <option value="">selecione…</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla} — {u.descricao}</option>)}
          </select>
        </Campo>
        <Campo rotulo={insumo ? 'Aproveitamento %' : 'Aproveitamento (fixo 100%)'}>
          <input type="number" min={1} max={100} value={insumo ? f.perc_aproveitamento : '100'}
            disabled={!insumo} onChange={e => setF({ ...f, perc_aproveitamento: e.target.value })} />
        </Campo>
        <Campo rotulo="Estoque mínimo">
          <input type="number" value={f.estoque_minimo} onChange={e => setF({ ...f, estoque_minimo: e.target.value })} /></Campo>
        <Campo rotulo="Estoque máximo">
          <input type="number" value={f.estoque_maximo} onChange={e => setF({ ...f, estoque_maximo: e.target.value })} /></Campo>
        <Campo rotulo="Item vendável (RN02)">
          <select value={f.vendavel ? '1' : '0'} onChange={e => setF({ ...f, vendavel: e.target.value === '1' })}>
            <option value="0">Não</option><option value="1">Sim</option>
          </select>
        </Campo>
        <button className="acao" onClick={enviar} disabled={!f.codigo || !f.nome || !f.unidade_padrao_id}>
          Cadastrar item
        </button>
      </div>
    </Painel>
  );
}

function FormFornecedor({ aoSalvar }: { aoSalvar: () => void }) {
  const vazio = {
    cnpj: '', razao_social: '', nome_fantasia: '', telefone: '', email: '', endereco: '', contato: '',
  };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null); setOk(null);
    try {
      await api.post('/fornecedores', f);
      setOk(`Fornecedor "${f.razao_social}" cadastrado.`); setF(vazio); aoSalvar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <Painel titulo="Novo fornecedor" rn="RF01">
      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />
      <div className="form">
        <Campo rotulo="CNPJ"><input value={f.cnpj} onChange={e => setF({ ...f, cnpj: e.target.value })} /></Campo>
        <Campo rotulo="Razão social">
          <input value={f.razao_social} onChange={e => setF({ ...f, razao_social: e.target.value })} /></Campo>
        <Campo rotulo="Nome fantasia">
          <input value={f.nome_fantasia} onChange={e => setF({ ...f, nome_fantasia: e.target.value })} /></Campo>
        <Campo rotulo="Contato"><input value={f.contato} onChange={e => setF({ ...f, contato: e.target.value })} /></Campo>
        <Campo rotulo="Telefone"><input value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} /></Campo>
        <Campo rotulo="E-mail"><input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo rotulo="Endereço"><input value={f.endereco} onChange={e => setF({ ...f, endereco: e.target.value })} /></Campo>
        <button className="acao" onClick={enviar} disabled={!f.cnpj || !f.razao_social}>Cadastrar fornecedor</button>
      </div>
    </Painel>
  );
}
