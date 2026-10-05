import pc from 'picocolors';

export const log = {
  step: (m: string) => console.log(`\n${pc.bold(pc.cyan(`› ${m}`))}`),
  ok: (m: string) => console.log(pc.green('  ✔ ') + m),
  warn: (m: string) => console.log(pc.yellow('  ⚠ ') + m),
  err: (m: string) => console.log(pc.red('  ✖ ') + m),
  info: (m: string) => console.log(pc.dim(`    ${m}`)),
};
