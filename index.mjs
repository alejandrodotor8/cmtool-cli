#!/usr/bin/env node
/**
 * ctf-migrate — migra entries de Contentful (padre + hijos) entre ambientes.
 * Entries e imágenes quedan en DRAFT. Los comandos están en src/commands/
 *
 * Este archivo es JavaScript para que el comando enlazado con `npm link` no cambie;
 * Node (>= 22.18) carga los módulos .ts directamente, sin compilar.
 */
import pc from 'picocolors';
import { AbortError, formatError, isCancel } from './src/errors.ts';
import { main } from './src/main.ts';
import { log } from './src/ui/log.ts';

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    if (isCancel(e)) {
      console.log(pc.dim('\nCancelado.'));
      process.exit(0);
    }
    if (e instanceof AbortError) {
      log.err(e.message);
      if (e.hint) log.info(e.hint);
      process.exit(1);
    }
    const msg = formatError(e);
    log.err(msg);
    if (msg.startsWith('401')) log.info('Tu sesión expiró. Corre: contentful login');
    process.exit(1);
  });
