import express from 'express';
import cors from 'cors';
import { cadastros } from './routes/cadastros';
import { operacao } from './routes/operacao';
import { relatorios } from './routes/relatorios';
import { loja, delivery } from './routes/loja';
import { RegraNegocioError } from './services/estoque';
import { seed } from './db/seed';
import { migrar } from './db/migrate';

const app = express();
app.use(cors());
app.use(express.json());

// Migração das colunas do delivery + parâmetros da loja
migrar();

// Carga de demonstração na primeira execução
if (seed()) console.log('> Base populada com os dados de demonstração.');

app.get('/api/health', (_req, res) => res.json({ ok: true, servico: 'Pizzaria João & Maria' }));
app.use('/api', cadastros);
app.use('/api', operacao);
app.use('/api/relatorios', relatorios);
app.use('/api/loja', loja);          // aplicação do cliente
app.use('/api/delivery', delivery);  // painel de pedidos da gestão

// Tratamento central de erros: regra de negócio vira 422, resto vira 500
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = String(err?.message ?? err);
  if (err instanceof RegraNegocioError || msg.includes('RN0'))
    return res.status(422).json({ erro: msg });
  if (msg.includes('UNIQUE constraint failed'))
    return res.status(409).json({ erro: 'Registro duplicado: ' + msg });
  if (msg.includes('CHECK constraint failed') || msg.includes('FOREIGN KEY'))
    return res.status(400).json({ erro: 'Violação de integridade: ' + msg });
  console.error(err);
  res.status(500).json({ erro: msg });
});

const PORT = Number(process.env.PORT ?? 3333);
app.listen(PORT, () => console.log(`> API da Pizzaria João & Maria em http://localhost:${PORT}/api`));
