/**
 * Ejecuta escrituras una por una, agrupadas en fases (Tags, Modelo, Imágenes, Entries).
 * Cada fase muestra una barra de progreso y al terminar la lista de ✔ / ✖.
 * Si una escritura falla, sigue con las demás.
 */
import * as p from '@clack/prompts';
import { formatError, type Runner } from 'cmtool-core';
import pc from 'picocolors';
import { log } from './log.ts';

export function createRunner({ animate }: { animate: boolean }): Runner {
  const failures: string[] = [];
  let phase: { title: string; total: number; done: number; lines: string[]; failed: number } | undefined;
  let bar: ReturnType<typeof p.progress> | undefined;

  const record = (line: string, failed: boolean) => {
    if (!phase) throw new Error('runner: falta start()');
    phase.lines.push(line);
    phase.done++;
    if (failed) phase.failed++;
    bar?.advance(1, `${phase.title} ${pc.dim(`${phase.done}/${phase.total}`)}`);
  };

  return {
    failures,

    /** Empieza una fase con `total` escrituras. */
    start(title: string, total: number): void {
      phase = { title, total, done: 0, lines: [], failed: 0 };
      if (animate) {
        bar = p.progress({ max: Math.max(total, 1), style: 'heavy' });
        bar.start(`${title} ${pc.dim(`0/${total}`)}`);
      } else {
        log.step(title);
      }
    },

    async run(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
        record(`${pc.green('✔')} ${label}`, false);
      } catch (e) {
        failures.push(label);
        record(`${pc.red('✖')} ${label} ${pc.dim('→')} ${pc.red(formatError(e))}`, true);
      }
    },

    /** Una escritura que no se puede hacer (por ejemplo, falta su content type). */
    fail(label: string, reason: string): void {
      failures.push(label);
      record(`${pc.red('✖')} ${label} ${pc.dim('→')} ${pc.red(reason)}`, true);
    },

    /** Cierra la fase: resumen en la barra y la lista de resultados. */
    end(): void {
      if (!phase) return;
      const { title, total, failed, lines } = phase;
      const summary = failed
        ? `${title}: ${pc.green(`${total - failed} ✔`)} · ${pc.red(`${failed} ✖`)}`
        : `${title}: ${pc.green(`${total} ✔`)}`;
      if (bar) failed ? bar.error(summary) : bar.stop(summary);
      else (failed ? log.err : log.ok)(summary);
      if (lines.length) log.block(lines.join('\n'));
      phase = undefined;
      bar = undefined;
    },
  };
}
