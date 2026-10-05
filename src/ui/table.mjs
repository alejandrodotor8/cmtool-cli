import pc from 'picocolors';

export const MARK = Object.freeze({ yes: pc.green('✔'), no: pc.red('✖'), diff: pc.yellow('≠') });

export const legend = () =>
  console.log(pc.dim(`  ${MARK.yes} existe   ${MARK.no} no existe   ${MARK.diff} tipo distinto`));

const ANSI = /\x1b\[[0-9;]*m/g;

/** Ancho visible de un texto (sin contar los códigos de color). */
export const width = (s) => String(s).replace(ANSI, '').length;

export const pad = (s, n, align = 'left') => {
  const gap = Math.max(0, n - width(s));
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
  return s + ' '.repeat(gap);
};

/** Recorta texto plano (sin color) para que las tablas no se desborden. */
export const clip = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Dibuja una tabla con borde redondeado.
 * columns: [{ header, align }]. Si ninguna columna tiene `header`, no pinta encabezado.
 * rows: arrays de celdas (pueden traer color).
 */
export function table({ title, columns, rows }) {
  const border = pc.dim;
  const widths = columns.map((c, i) => Math.max(width(c.header ?? ''), ...rows.map((r) => width(r[i] ?? ''))));
  const used = widths.reduce((a, w) => a + w, 0) + 2 * (columns.length - 1);
  const inner = Math.max(used, title ? width(title) + 2 : 0);
  widths[widths.length - 1] += inner - used;

  const line = (cells) =>
    border('│ ') + cells.map((c, i) => pad(c ?? '', widths[i], columns[i].align)).join('  ') + border(' │');
  const rule = (left, right) => border(left + '─'.repeat(inner + 2) + right);

  const out = [
    title ? border('╭─ ') + title + ' ' + border('─'.repeat(inner - width(title) - 1) + '╮') : rule('╭', '╮'),
  ];
  if (columns.some((c) => c.header)) {
    out.push(line(columns.map((c) => pc.bold(c.header ?? ''))));
    out.push(rule('├', '┤'));
  }
  rows.forEach((r) => out.push(line(r)));
  out.push(rule('╰', '╯'));
  console.log(out.map((l) => '  ' + l).join('\n'));
}
