import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';

/** Busca dados da API com estado de carregamento, erro e recarga. */
export function useApi<T>(caminho: string | null, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(() => {
    if (!caminho) return;
    setCarregando(true);
    api.get<T>(caminho)
      .then(d => { setDados(d); setErro(null); })
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [caminho]);

  useEffect(recarregar, [recarregar, ...deps]);
  return { dados, erro, carregando, recarregar };
}

export function Painel({ titulo, rn, children, acao }:
{ titulo?: string; rn?: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="painel">
      {titulo && (
        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{titulo}{rn && <span className="rn">{rn}</span>}</span>
          {acao}
        </h3>
      )}
      {children}
    </div>
  );
}

export function Card({ rotulo, valor, nota }: { rotulo: string; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="card">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}

export function Tag({ tipo, children }: { tipo: 'ok' | 'aviso' | 'erro' | 'neutro'; children: ReactNode }) {
  return <span className={`tag ${tipo}`}>{children}</span>;
}

export function Mensagem({ tipo, texto, aoFechar }:
{ tipo: 'erro' | 'ok' | 'info'; texto: string | null; aoFechar?: () => void }) {
  if (!texto) return null;
  return (
    <div className={`aviso-box ${tipo}`} onClick={aoFechar} style={{ cursor: aoFechar ? 'pointer' : undefined }}>
      {texto}
    </div>
  );
}

export function Estado({ carregando, erro, vazio, children }:
{ carregando: boolean; erro: string | null; vazio?: boolean; children: ReactNode }) {
  if (carregando) return <div className="vazio">Carregando…</div>;
  if (erro) return <Mensagem tipo="erro" texto={erro} />;
  if (vazio) return <div className="vazio">Nenhum registro encontrado.</div>;
  return <>{children}</>;
}

export function TagSituacao({ situacao }: { situacao: string }) {
  if (situacao === 'ABAIXO_MINIMO') return <Tag tipo="erro">Abaixo do mínimo</Tag>;
  if (situacao === 'ACIMA_MAXIMO') return <Tag tipo="aviso">Acima do máximo</Tag>;
  return <Tag tipo="ok">Normal</Tag>;
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div><label>{rotulo}</label>{children}</div>;
}
