import { Router } from 'express';
import { historicoCompras, variacaoGastos, consumoVendas, alertas, dashboard } from '../services/relatorios';

export const relatorios = Router();

relatorios.get('/dashboard', (_req, res) => res.json(dashboard()));

// RF13
relatorios.get('/historico-compras', (req, res) => res.json(historicoCompras({
  item_id: req.query.item_id ? Number(req.query.item_id) : undefined,
  fornecedor_id: req.query.fornecedor_id ? Number(req.query.fornecedor_id) : undefined,
  de: req.query.de as string | undefined,
  ate: req.query.ate as string | undefined,
})));

// RF18
relatorios.get('/variacao-gastos', (req, res) => res.json(variacaoGastos({
  de: req.query.de as string | undefined,
  ate: req.query.ate as string | undefined,
})));

// RF19
relatorios.get('/consumo-vendas', (req, res) => res.json(consumoVendas({
  de: req.query.de as string | undefined,
  ate: req.query.ate as string | undefined,
})));

// RF20
relatorios.get('/alertas', (req, res) =>
  res.json(alertas(req.query.dias ? Number(req.query.dias) : 30)));
