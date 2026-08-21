import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', '..', 'pizzaria.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

/** Consulta que devolve várias linhas. */
export function all<T = any>(sql: string, params: any[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/** Consulta que devolve uma linha (ou undefined). */
export function one<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

/** INSERT/UPDATE/DELETE. Devolve o id gerado e as linhas afetadas. */
export function run(sql: string, params: any[] = []) {
  const r = db.prepare(sql).run(...params);
  return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

/** Executa um bloco dentro de uma transação (tudo ou nada). */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function isEmpty(): boolean {
  const r = one<{ n: number }>('SELECT COUNT(*) AS n FROM item');
  return !r || r.n === 0;
}
