/**
 * El script `dev` (`bun run dev`, `npm run dev`…): corre el código fuente del CLI (src/) sin
 * compilar. Node (>= 22.18) quita los tipos de los .ts al vuelo, así que cualquier cambio se ve en
 * la siguiente ejecución. El núcleo (cmtool-core) se usa ya compilado, desde node_modules, como
 * cualquier dependencia.
 *
 * Es solo para desarrollar: no es un comando (bin) y está en scripts/, que no se publica en npm.
 */
import { run } from '../src/cli.ts';

await run(process.argv.slice(2), 'dev');
