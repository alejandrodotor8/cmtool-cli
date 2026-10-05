#!/usr/bin/env node
/**
 * ctf-migrate — migra entries de Contentful (padre + hijos) entre ambientes.
 * Entries e imágenes quedan en DRAFT. El flujo completo está en src/main.mjs.
 */
import pc from 'picocolors';
import { main } from './src/main.mjs';
import { AbortError, formatError, isCancel } from './src/errors.mjs';
import { log } from './src/ui/log.mjs';

main()
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
