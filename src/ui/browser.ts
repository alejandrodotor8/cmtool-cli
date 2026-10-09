import { spawn } from 'node:child_process';

/** Cómo se abre una URL en el navegador de cada sistema. */
const OPENER: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'open',
  win32: 'explorer.exe',
  linux: 'xdg-open',
};

/** Abre una URL en el navegador, sin esperar. Devuelve si lo intentó (si no, hay que mostrar la URL). */
export function openInBrowser(url: string): boolean {
  const opener = OPENER[process.platform];
  if (!opener) return false;
  try {
    const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
