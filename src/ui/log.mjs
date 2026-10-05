import pc from 'picocolors';

export const log = {
  step: (m) => console.log('\n' + pc.bold(pc.cyan('› ' + m))),
  ok: (m) => console.log(pc.green('  ✔ ') + m),
  warn: (m) => console.log(pc.yellow('  ⚠ ') + m),
  err: (m) => console.log(pc.red('  ✖ ') + m),
  info: (m) => console.log(pc.dim('    ' + m)),
};
