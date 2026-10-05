/**
 * Entrada de ctf-migrate: lee los argumentos y corre el comando.
 * Devuelve el código de salida.
 */
import { parseCliArgs, USAGE } from './cli-args.ts';
import { migrate } from './commands/migrate.ts';
import { restore } from './commands/restore.ts';

export async function main(argv: string[]): Promise<number> {
  const args = parseCliArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  return args.command === 'restore' ? restore(args) : migrate(args);
}
