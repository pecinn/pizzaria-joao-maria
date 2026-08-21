import { Router } from 'express';
import { all, run } from '../db';
import { configTodas } from '../db/migrate';
import {
  cardapioPublico, configuracaoLoja, criarPedidoLoja, acompanhar,
  painelPedidos, alterarStatus, contarEmAberto,
} from '../services/loja';

/* =================== APLICAÇÃO DO CLIENTE (pública) =================== */

export const loja = Router();

loja.get('/config', (_req, res) => res.json(configuracaoLoja()));

loja.get('/cardapio', (_req, res) => res.json(cardapioPublico()));

loja.post('/pedidos', (req, res, next) => {
  try {
    res.status(201).json(criarPedidoLoja(req.body));
  } catch (e) { next(e); }
});

// Acompanhamento pelo código do pedido — é o "meus pedidos" do cliente
loja.get('/pedidos/:codigo', (req, res) => {
  const pedido = acompanhar(String(req.params.codigo).toUpperCase());
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado. Confira o código.' });
  res.json(pedido);
});

/* =================== PAINEL DE DELIVERY (gestão) =================== */

export const delivery = Router();

delivery.get('/pedidos', (req, res) => res.json(painelPedidos({
  status: req.query.status as string | undefined,
  data: req.query.data as string | undefined,
})));

delivery.get('/resumo', (_req, res) => res.json({
  em_aberto: contarEmAberto(),
  por_status: all(
    `SELECT status_preparo AS status, COUNT(*) AS quantidade
       FROM pedido WHERE origem = 'APP'
        AND date(data_hora) = date('now','localtime')
      GROUP BY status_preparo`),
}));

delivery.post('/pedidos/:id/status', (req, res, next) => {
  try {
    res.json(alterarStatus(Number(req.params.id), req.body.status, req.body.usuario_id ?? 1));
  } catch (e) { next(e); }
});

/* Configuração da loja, editável pela gestão */
delivery.get('/configuracao', (_req, res) => res.json(configTodas()));

delivery.put('/configuracao', (req, res) => {
  for (const [chave, valor] of Object.entries(req.body ?? {}))
    run('UPDATE configuracao SET valor = ? WHERE chave = ?', [String(valor), chave]);
  res.json(configTodas());
});
