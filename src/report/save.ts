import fs from 'node:fs';
import path from 'node:path';
import type { CliArgs } from '../cli-args.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { askText, askYesNo } from '../ui/prompts.ts';

/**
 * Guarda un reporte Markdown: con --report, en ese archivo; sin flag y en una terminal
 * interactiva, pregunta si guardarlo. `build` solo se llama si se va a guardar.
 */
export async function offerReport(args: Pick<CliArgs, 'report'>, defaultName: string, build: () => string) {
  let file = args.report;
  if (!file && process.stdin.isTTY) {
    let save = false;
    await steps([
      async () => {
        save = await askYesNo('¿Guardar esto como reporte Markdown?', false);
      },
      async () => {
        if (save) file = (await askText('Nombre del archivo', { placeholder: defaultName })) || defaultName;
      },
    ]);
  }
  if (!file) return;
  const target = path.resolve(file);
  fs.writeFileSync(target, `${build()}\n`);
  log.ok(`Reporte guardado: ${target}`);
}

/** "modelos-develop-vs-qa-2026-10-07.md". */
export const reportName = (kind: string, src: string, dst: string, now = new Date()) =>
  `${kind}-${src}-vs-${dst}-${now.toISOString().slice(0, 10)}.md`;
