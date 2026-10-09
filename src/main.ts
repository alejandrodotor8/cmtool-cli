/**
 * Entrada de cfm: lee los argumentos, muestra el menú si no se dio un comando y
 * corre el comando. Devuelve el código de salida.
 */

import { VERSION } from './app.ts';
import { type Command, parseCliArgs, usage, validateFlags } from './cli-args.ts';
import { prefetch } from './commands/context.ts';
import { ensureSession } from './commands/login.ts';
import { RUNNERS } from './commands/registry.ts';
import { printIntro, type RunMode } from './ui/header.ts';
import { steps } from './ui/navigation.ts';
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
  // La primera vez, sin sesión: pide el token antes del menú (login lo pide él mismo; logout no lo necesita).
  const handlesSession = args.command === 'login' || args.command === 'logout';
  if (!handlesSession && !(await ensureSession(args))) return 0;
  prefetch(args);
  // Elegido en el menú, Esc desde la primera pregunta del comando vuelve al menú.
  let command = args.command;
  const code = await steps([
    async () => {
      command = args.command ?? (await pickCommand());
      validateFlags(command, args);
    },
    () => RUNNERS[command as Command]({ ...args, command }),
  ]);
  return code ?? 0;
}
