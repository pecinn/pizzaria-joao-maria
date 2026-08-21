/** Data de hoje no fuso local. `toISOString()` devolve UTC e, de madrugada,
 *  aponta para o dia seguinte — o que não bate com datetime('now','localtime'). */
export function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
