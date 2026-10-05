import pc from 'picocolors';

export const MARK = { yes: pc.green('✔'), no: pc.red('✖'), diff: pc.red('≠'), rules: pc.yellow('!') } as const;

export const legend = () =>
  console.log(
    pc.dim(`  ${MARK.yes} existe   ${MARK.no} no existe   ${MARK.diff} tipo distinto   ${MARK.rules} reglas distintas`),
  );

// biome-ignore lint/suspicious/noControlCharactersInRegex: son los códigos ANSI de color
const ANSI = /\x1b\[[0-9;]*m/g;

/** Ancho visible de un texto (sin contar los códigos de color). */
export const width = (s: string): number => s.replace(ANSI, '').length;

export const pad = (s: string, n: number, align: Align = 'left'): string => {
  const gap = Math.max(0, n - width(s));
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
  return s + ' '.repeat(gap);
};

/** Recorta texto plano (sin color) para que las tablas no se desborden. */
export const clip = (s: string, n = 34): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type Align = 'left' | 'center';

export interface Column {
  header?: string;
  align?: Align;
}

/**
 * Dibuja una tabla con borde redondeado.
 * Si ninguna columna tiene `header`, no pinta encabezado. Las celdas pueden traer color.
 */
export function table({ title, columns, rows }: { title?: string; columns: Column[]; rows: string[][] }): void {
  const border = pc.dim;
  const widths = columns.map((c, i) => Math.max(width(c.header ?? ''), ...rows.map((r) => width(r[i] ?? ''))));
  const used = widths.reduce((a, w) => a + w, 0) + 2 * (columns.length - 1);
  const inner = Math.max(used, title ? width(title) + 2 : 0);
  widths[widths.length - 1] = (widths.at(-1) ?? 0) + inner - used;

  const line = (cells: string[]) =>
    border('│ ') + cells.map((c, i) => pad(c, widths[i] ?? 0, columns[i]?.align)).join('  ') + border(' │');
  const rule = (left: string, right: string) => border(left + '─'.repeat(inner + 2) + right);

  const top = title ? `${border('╭─ ')}${title} ${border(`${'─'.repeat(inner - width(title) - 1)}╮`)}` : rule('╭', '╮');
  const out = [top];
  if (columns.some((c) => c.header)) {
    out.push(line(columns.map((c) => pc.bold(c.header ?? ''))));
    out.push(rule('├', '┤'));
  }
  for (const r of rows) out.push(line(r));
  out.push(rule('╰', '╯'));
  console.log(out.map((l) => `  ${l}`).join('\n'));
}
