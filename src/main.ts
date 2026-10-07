/**
 * Entrada de cfm: lee los argumentos, muestra el menú si no se dio un comando y
 * corre el comando. Devuelve el código de salida.
 */

import { VERSION } from './app.ts';
import { parseCliArgs, usage, validateFlags } from './cli-args.ts';
import { RUNNERS } from './commands/registry.ts';
import { printIntro, type RunMode } from './ui/header.ts';
import { pickCommand } from './ui/prompts.ts';

export async function main(argv: string[], mode: RunMode): Promise<number> {
  const args = parseCliArgs(argv);
  if (args.version) {
    console.log(VERSION);
    return 0;
  }
  if (args.help) {
    console.log(usage());
    return 0;
  }
  printIntro(mode);
  const command = args.command ?? (await pickCommand());
  validateFlags(command, args);
  return RUNNERS[command]({ ...args, command });
}
