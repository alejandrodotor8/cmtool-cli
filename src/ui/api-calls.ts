import pc from 'picocolors';

/** Cuenta las llamadas a la API de la ejecución y, con --verbose, las muestra a medida que salen. */
export function trackApiCalls(verbose: boolean) {
  const tracker = {
    count: 0,
    onRequest: (request: string) => {
      tracker.count++;
      if (verbose) console.log(pc.dim(`    · ${request}`));
    },
  };
  return tracker;
}
