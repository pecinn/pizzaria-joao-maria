import { db, run, one, tx, isEmpty } from './index';

/**
 * Carga inicial de demonstração.
 * Todas as entradas de estoque são feitas por MOVIMENTO (RN06) —
 * nenhuma linha de saldo_estoque é escrita diretamente.
 */
export function seed(force = false) {
  if (!force && !isEmpty()) return false;

  tx(() => {
    if (force) {
      for (const t of [
        'item_pedido', 'pedido', 'fechamento_diario', 'preco_venda', 'ficha_tecnica',
        'produto', 'tamanho', 'movimento_estoque', 'saldo_estoque', 'item_nota_fiscal',
        'nota_fiscal_compra', 'item_fornecedor', 'item', 'fornecedor', 'unidade_medida', 'usuario',
      ]) db.exec(`DELETE FROM ${t}`);
    }

    // ---- Unidades de medida (RN03) ----
    const un: Record<string, number> = {};
    for (const [sigla, desc, tipo] of [
      ['g', 'Grama', 'MASSA'], ['kg', 'Quilograma', 'MASSA'],
      ['ml', 'Mililitro', 'VOLUME'], ['l', 'Litro', 'VOLUME'],
      ['un', 'Unidade', 'UNIDADE'], ['cx', 'Caixa', 'UNIDADE'],
      ['fd', 'Fardo', 'UNIDADE'],
    ]) un[sigla] = run(
      'INSERT INTO unidade_medida (sigla, descricao, tipo) VALUES (?,?,?)', [sigla, desc, tipo],
    ).id;

    // ---- Usuários (auditoria) ----
    const admin = run(
      "INSERT INTO usuario (nome, login, perfil) VALUES ('Maria Souza','maria','ADMIN')").id;
    run("INSERT INTO usuario (nome, login, perfil) VALUES ('João Souza','joao','ESTOQUE')");
    run("INSERT INTO usuario (nome, login, perfil) VALUES ('Ana Caixa','ana','CAIXA')");

    // ---- Fornecedores (RF01) ----
    const forn = [
      ['12.345.678/0001-90', 'Distribuidora Pantanal LTDA', 'Pantanal Alimentos', '(67) 3321-4455', 'vendas@pantanal.com.br', 'Av. Afonso Pena, 1200 - Campo Grande/MS', 'Carlos Lima'],
      ['98.765.432/0001-10', 'Laticínios Bom Queijo S/A', 'Bom Queijo', '(67) 3322-8899', 'comercial@bomqueijo.com.br', 'Rua das Indústrias, 45 - Dourados/MS', 'Fernanda Reis'],
      ['45.111.222/0001-33', 'Bebidas Center Distribuidora', 'Bebidas Center', '(67) 3333-1010', 'pedidos@bebidascenter.com.br', 'Rod. BR-163, km 12 - Campo Grande/MS', 'Rogério Alves'],
    ].map(f => run(
      `INSERT INTO fornecedor (cnpj, razao_social, nome_fantasia, telefone, email, endereco, contato)
       VALUES (?,?,?,?,?,?,?)`, f).id);

    // ---- Itens (RF02) ----
    // [codigo, nome, tipo, unidade, aproveitamento, min, max, vendavel]
    const itensDef: [string, string, string, string, number, number, number, number][] = [
      ['INS001', 'Farinha de trigo tipo 1', 'INSUMO', 'g', 100, 20000, 100000, 0],
      ['INS002', 'Queijo mussarela', 'INSUMO', 'g', 95, 10000, 40000, 0],
      ['INS003', 'Molho de tomate', 'INSUMO', 'g', 100, 5000, 20000, 0],
      ['INS004', 'Calabresa', 'INSUMO', 'g', 90, 4000, 18000, 0],
      ['INS005', 'Cebola', 'INSUMO', 'g', 80, 2000, 10000, 0],
      ['INS006', 'Presunto', 'INSUMO', 'g', 95, 3000, 12000, 0],
      ['INS007', 'Azeitona verde', 'INSUMO', 'g', 85, 1000, 5000, 0],
      ['INS008', 'Orégano', 'INSUMO', 'g', 100, 300, 2000, 0],
      ['INS009', 'Ovo cozido', 'INSUMO', 'g', 88, 1000, 5000, 0],
      ['INS010', 'Chocolate ao leite', 'INSUMO', 'g', 100, 2000, 8000, 0],
      ['INS011', 'Morango', 'INSUMO', 'g', 70, 1500, 6000, 0],
      ['BEB001', 'Refrigerante lata 350ml', 'BEBIDA', 'un', 100, 24, 120, 1],
      ['BEB002', 'Refrigerante 2 litros', 'BEBIDA', 'un', 100, 12, 60, 1],
      ['BEB003', 'Água mineral 500ml', 'BEBIDA', 'un', 100, 24, 96, 1],
      ['EMB001', 'Caixa de pizza grande', 'EMBALAGEM', 'un', 100, 100, 600, 0],
      ['DES001', 'Guardanapo', 'DESCARTAVEL', 'un', 100, 500, 3000, 0],
    ];
    const it: Record<string, number> = {};
    for (const [cod, nome, tipo, u, ap, mn, mx, vd] of itensDef) {
      it[cod] = run(
        `INSERT INTO item (codigo, nome, tipo, unidade_padrao_id, perc_aproveitamento,
                           estoque_minimo, estoque_maximo, vendavel)
         VALUES (?,?,?,?,?,?,?,?)`, [cod, nome, tipo, un[u], ap, mn, mx, vd]).id;
    }

    // ---- Item x Fornecedor com fator de conversão (RN03, RN12) ----
    const vinculos: [string, number, string, number, number][] = [
      ['INS001', 0, 'kg', 1000, 3], ['INS003', 0, 'kg', 1000, 3],
      ['INS005', 0, 'kg', 1000, 2], ['INS008', 0, 'kg', 1000, 5],
      ['INS011', 0, 'kg', 1000, 2],
      ['INS002', 1, 'kg', 1000, 2], ['INS004', 1, 'kg', 1000, 2],
      ['INS006', 1, 'kg', 1000, 2], ['INS007', 1, 'kg', 1000, 4],
      ['INS009', 1, 'kg', 1000, 3], ['INS010', 1, 'kg', 1000, 4],
      ['BEB001', 2, 'cx', 12, 1], ['BEB002', 2, 'fd', 6, 1], ['BEB003', 2, 'fd', 12, 1],
      ['EMB001', 0, 'fd', 25, 7], ['DES001', 0, 'fd', 500, 7],
    ];
    for (const [cod, f, uc, fator, prazo] of vinculos) {
      run(`INSERT INTO item_fornecedor
             (item_id, fornecedor_id, codigo_no_fornecedor, unidade_compra_id, fator_conversao, prazo_entrega_dias)
           VALUES (?,?,?,?,?,?)`, [it[cod], forn[f], `F${cod}`, un[uc], fator, prazo]);
    }

    // ---- Tamanhos e sabores (RF04) ----
    const tam: Record<string, number> = {};
    for (const [d, f] of [['Broto', 4], ['Média', 6], ['Grande', 8], ['Família', 12]] as [string, number][])
      tam[d] = run('INSERT INTO tamanho (descricao, numero_fatias) VALUES (?,?)', [d, f]).id;

    const prod: Record<string, number> = {};
    for (const [nome, cat, desc] of [
      ['Mussarela', 'SALGADA', 'Molho, mussarela e orégano'],
      ['Calabresa', 'SALGADA', 'Molho, mussarela, calabresa e cebola'],
      ['Portuguesa', 'SALGADA', 'Molho, mussarela, presunto, ovo, cebola e azeitona'],
      ['Chocolate com Morango', 'DOCE', 'Chocolate ao leite com morangos frescos'],
    ] as [string, string, string][])
      prod[nome] = run('INSERT INTO produto (nome, categoria, descricao) VALUES (?,?,?)', [nome, cat, desc]).id;

    // ---- Fichas técnicas por sabor e tamanho (RF05, RN09) ----
    // Quantidades da pizza GRANDE; os demais tamanhos escalam por fator.
    const escala: Record<string, number> = { 'Broto': 0.5, 'Média': 0.75, 'Grande': 1, 'Família': 1.5 };
    const receitas: Record<string, Record<string, number>> = {
      'Mussarela': { INS001: 250, INS003: 120, INS002: 250, INS008: 3, EMB001: 1 },
      'Calabresa': { INS001: 250, INS003: 120, INS002: 180, INS004: 150, INS005: 60, INS008: 3, EMB001: 1 },
      'Portuguesa': { INS001: 250, INS003: 120, INS002: 180, INS006: 120, INS009: 80, INS005: 50, INS007: 40, INS008: 3, EMB001: 1 },
      'Chocolate com Morango': { INS001: 250, INS010: 220, INS011: 150, EMB001: 1 },
    };
    for (const [sabor, receita] of Object.entries(receitas)) {
      for (const [tamNome, fator] of Object.entries(escala)) {
        for (const [cod, qtd] of Object.entries(receita)) {
          const q = cod === 'EMB001' ? 1 : Math.round(qtd * fator * 100) / 100;
          run(`INSERT INTO ficha_tecnica (produto_id, tamanho_id, item_id, quantidade)
               VALUES (?,?,?,?)`, [prod[sabor], tam[tamNome], it[cod], q]);
        }
      }
    }

    // ---- Preços de venda com vigência (RF06, RN10) ----
    const precoBase: Record<string, number> = {
      'Mussarela': 45, 'Calabresa': 49, 'Portuguesa': 55, 'Chocolate com Morango': 52,
    };
    const fatorPreco: Record<string, number> = { 'Broto': 0.55, 'Média': 0.8, 'Grande': 1, 'Família': 1.35 };
    for (const [sabor, base] of Object.entries(precoBase))
      for (const [tamNome, f] of Object.entries(fatorPreco))
        run(`INSERT INTO preco_venda (produto_id, tamanho_id, valor, data_inicio)
             VALUES (?,?,?, date('now','-60 days'))`,
          [prod[sabor], tam[tamNome], Math.round(base * f * 100) / 100]);

    // Bebidas: preço próprio no cadastro único do item (RN02)
    for (const [cod, valor] of [['BEB001', 7], ['BEB002', 14], ['BEB003', 4]] as [string, number][])
      run(`INSERT INTO preco_venda (item_id, valor, data_inicio) VALUES (?,?, date('now','-60 days'))`,
        [it[cod], valor]);

    // ---- Nota fiscal de compra + entradas por movimento (RF07, RF08) ----
    // [item, fornecedor, un.compra, fator, qtd comprada, valor unitário na un. de compra]
    const compras: [string, number, string, number, number, number][] = [
      ['INS001', 0, 'kg', 1000, 50, 4.20], ['INS003', 0, 'kg', 1000, 15, 8.90],
      ['INS005', 0, 'kg', 1000, 8, 5.50], ['INS008', 0, 'kg', 1000, 1, 38.00],
      ['INS011', 0, 'kg', 1000, 4, 22.00],
      ['INS002', 1, 'kg', 1000, 30, 32.50], ['INS004', 1, 'kg', 1000, 12, 24.90],
      ['INS006', 1, 'kg', 1000, 8, 28.00], ['INS007', 1, 'kg', 1000, 1, 19.90],
      ['INS009', 1, 'kg', 1000, 1, 15.00], ['INS010', 1, 'kg', 1000, 6, 41.00],
      ['BEB001', 2, 'cx', 12, 8, 36.00], ['BEB002', 2, 'fd', 6, 6, 52.00],
      ['BEB003', 2, 'fd', 12, 2, 21.00],
      ['EMB001', 0, 'fd', 25, 16, 30.00], ['DES001', 0, 'fd', 500, 4, 12.00],
    ];
    const notas = [
      { forn: 0, numero: '10245', serie: '1', frete: 45, desc: 0 },
      { forn: 1, numero: '77812', serie: '2', frete: 30, desc: 12.5 },
      { forn: 2, numero: '55190', serie: '1', frete: 60, desc: 0 },
    ];
    const notaIds = notas.map(n => run(
      `INSERT INTO nota_fiscal_compra
         (numero, serie, fornecedor_id, data_emissao, data_entrada, valor_frete, valor_desconto, usuario_id)
       VALUES (?,?,?, date('now','-7 days'), date('now','-6 days'), ?,?,?)`,
      [n.numero, n.serie, forn[n.forn], n.frete, n.desc, admin]).id);

    for (const [cod, f, uc, fator, qtd, vu] of compras) {
      run(`INSERT INTO item_nota_fiscal
             (nota_id, item_id, quantidade, unidade_compra_id, fator_conversao, valor_unitario)
           VALUES (?,?,?,?,?,?)`, [notaIds[f], it[cod], qtd, un[uc], fator, vu]);
      // Conversão para a unidade padrão (RN03) e custo unitário nessa unidade
      run(`INSERT INTO movimento_estoque
             (item_id, tipo, quantidade, custo_unitario, data_hora, documento_origem, usuario_id, observacao)
           VALUES (?, 'ENTRADA', ?, ?, datetime('now','-6 days'), ?, ?, 'Carga inicial')`,
        [it[cod], qtd * fator, vu / fator, `NF ${notas[f].numero}/${notas[f].serie}`, admin]);
    }

    // ---- Vendas dos últimos dias (RF17) — base do fechamento diário ----
    const vendas: [number, string, string, string, string, number][] = [
      [3, 'BALCAO', 'PIX', 'Calabresa', 'Grande', 2],
      [3, 'DELIVERY', 'CREDITO', 'Mussarela', 'Média', 3],
      [2, 'MESA', 'DEBITO', 'Portuguesa', 'Grande', 2],
      [2, 'DELIVERY', 'PIX', 'Calabresa', 'Família', 1],
      [1, 'BALCAO', 'DINHEIRO', 'Chocolate com Morango', 'Média', 2],
      [1, 'DELIVERY', 'PIX', 'Mussarela', 'Grande', 4],
    ];
    for (const [diasAtras, atend, pgto, sabor, tamNome, qtd] of vendas) {
      const ped = run(
        `INSERT INTO pedido (data_hora, tipo_atendimento, forma_pagamento, situacao, usuario_id)
         VALUES (datetime('now', ?), ?, ?, 'FECHADO', ?)`,
        [`-${diasAtras} days`, atend, pgto, admin]).id;
      const preco = one<{ valor: number }>(
        'SELECT valor FROM vw_preco_vigente WHERE produto_id=? AND tamanho_id=?',
        [prod[sabor], tam[tamNome]])!.valor;
      run(`INSERT INTO item_pedido (pedido_id, produto_id, tamanho_id, quantidade, preco_praticado)
           VALUES (?,?,?,?,?)`, [ped, prod[sabor], tam[tamNome], qtd, preco]);
      // Uma bebida junto
      const bebPreco = one<{ valor: number }>(
        'SELECT valor FROM vw_preco_vigente WHERE item_id=?', [it['BEB001']])!.valor;
      run(`INSERT INTO item_pedido (pedido_id, item_id, quantidade, preco_praticado)
           VALUES (?,?,?,?)`, [ped, it['BEB001'], qtd, bebPreco]);
    }

    // ---- Uma perda registrada (RF09) ----
    run(`INSERT INTO movimento_estoque
           (item_id, tipo, quantidade, data_hora, documento_origem, usuario_id, observacao)
         VALUES (?, 'PERDA', -800, datetime('now','-2 days'), 'PERDA-001', ?, 'Queijo vencido na câmara fria')`,
      [it['INS002'], admin]);
  });

  return true;
}
