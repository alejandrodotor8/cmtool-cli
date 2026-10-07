#!/usr/bin/env node
/**
 * cfm-dev: corre el código fuente (src/) sin compilar. Node (>= 22.18) quita los
 * tipos de los .ts al vuelo, así que cualquier cambio se ve en la siguiente ejecución.
 */
import { run } from '../src/cli.ts';

await run(process.argv.slice(2), 'dev');
