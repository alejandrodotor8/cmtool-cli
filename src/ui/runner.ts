import { formatError } from '../errors.ts';
import { log } from './log.ts';

/** Ejecuta escrituras una por una: muestra ✔ o ✖ y sigue aunque alguna falle. */
export function createRunner() {
  const failures: string[] = [];
  return {
    failures,
    async run(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
        log.ok(label);
      } catch (e) {
        failures.push(label);
        log.err(`${label} → ${formatError(e)}`);
      }
    },
    fail(label: string, reason: string): void {
      failures.push(label);
      log.err(`${label}: ${reason}`);
    },
  };
}
