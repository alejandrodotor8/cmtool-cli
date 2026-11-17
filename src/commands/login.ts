/**
 * Iniciar y cerrar sesión sin el Contentful CLI: se pega un token personal, se prueba con
 * Contentful y se guarda donde lo guarda `contentful login`, así lo usan los dos. Se pregunta solo
 * si no hay sesión (la primera vez), o con `cfm login` para cambiar el token. `cfm logout` lo quita.
 */

import { CMA_HOST_NAMES, createCma, currentUser, statusOf } from 'cmtool-core';
import pc from 'picocolors';
import { APP_NAME } from '../app.ts';
import type { CliArgs } from '../cli-args.ts';
import { forgetToken, hasSession, looksLikeToken, savedTokenFile, saveToken, sessionFile } from '../session.ts';
import { openInBrowser } from '../ui/browser.ts';
import { printCancelled, printOutro, printTitle, shouldAnimate } from '../ui/header.ts';
import { log } from '../ui/log.ts';
import { steps } from '../ui/navigation.ts';
import { askSecret, askYesNo, choose } from '../ui/prompts.ts';
import { withStatus } from '../ui/status.ts';

/** Página de Contentful donde se crean los tokens personales. */
const TOKENS_PAGE = 'https://app.contentful.com/account/profile/cma_tokens';

type User = Awaited<ReturnType<typeof currentUser>>;

/**
 * En qué host funciona el token: se prueba en orden (primero el normal, después EU) y solo en
 * hosts de Contentful. `undefined` si ninguno lo acepta (401). Otros errores (sin red…) se lanzan.
 */
export async function tokenHost(
  userIn: (host: string) => Promise<User>,
): Promise<{ host: string; user: User } | undefined> {
  for (const host of CMA_HOST_NAMES) {
    try {
      return { host, user: await userIn(host) };
    } catch (e) {
      if (statusOf(e) !== 401) throw e;
    }
  }
  return undefined;
}

function showTokensPage() {
  const opened = openInBrowser(TOKENS_PAGE);
  log.step(opened ? 'Abrí Contentful en tu navegador.' : `Abre en tu navegador: ${TOKENS_PAGE}`);
  log.info(
    'Entra con tu cuenta, crea un token personal (Create personal access token), ponle un nombre\n' +
      `(por ejemplo, ${APP_NAME}) y cópialo: Contentful lo muestra una sola vez.`,
  );
}

/** Contentful no aceptó el token (se vuelve a pedir). */
const REJECTED = new Error('token rechazado');

/** Pide el token hasta que Contentful lo acepte, y lo guarda. */
async function pasteToken(animate: boolean): Promise<void> {
  while (true) {
    const token = await askSecret('Pega tu token de Contentful', (value) =>
      looksLikeToken(value)
        ? undefined
        : 'No parece un token: tiene entre 43 y 64 letras, números, - o _ (los personales empiezan con CFPAT-).',
    );
    try {
      const found = await withStatus(
        'Revisando el token con Contentful…',
        animate,
        async () => (await tokenHost((host) => currentUser(createCma({ token, host })))) ?? Promise.reject(REJECTED),
        ({ user }) => `Entraste como ${user.email ?? user.id}`,
      );
      const file = saveToken(token, found.host);
      log.info(`Lo guardé en ${file}, como contentful login: la próxima vez no te lo pido.`);
      return;
    } catch (e) {
      if (e !== REJECTED) throw e;
      log.warn('Contentful no aceptó ese token. Revisa que lo copiaste completo, o crea uno nuevo.');
    }
  }
}

/** Elegir cómo entrar y, si es con token, pedirlo y guardarlo. Devuelve si quedó guardado. */
async function logIn(args: Pick<CliArgs, 'verbose'>, message: string): Promise<boolean> {
  let method = 'browser';
  let saved = false;
  await steps([
    async () => {
      method = await choose(message, [
        { value: 'browser', label: 'Crear un token en Contentful y pegarlo aquí', hint: 'abre el navegador' },
        { value: 'paste', label: 'Ya tengo un token: pegarlo aquí' },
        {
          value: 'cli',
          label: 'Iniciar sesión con el Contentful CLI',
          hint: 'contentful login · si lo tienes instalado',
        },
      ]);
    },
    async () => {
      if (method === 'cli') return;
      if (method === 'browser') showTokensPage();
      await pasteToken(shouldAnimate(args.verbose));
      saved = true;
    },
  ]);
  if (!saved) printOutro(`Corre ${pc.cyan('contentful login')} y vuelve a abrir ${APP_NAME}.`);
  return saved;
}

/**
 * La primera vez (sin sesión y en una terminal), pide el token antes del menú.
 * Devuelve si se puede seguir. Sin terminal no pregunta: el comando explica qué hacer.
 */
export async function ensureSession(args: Pick<CliArgs, 'verbose'>): Promise<boolean> {
  if (hasSession() || !process.stdin.isTTY) return true;
  return logIn(args, 'No encontré tu sesión de Contentful. ¿Cómo quieres entrar?');
}

/** `cfm login`: pegar un token nuevo (por ejemplo, si el anterior venció). */
export async function login(args: CliArgs): Promise<number> {
  printTitle('Iniciar sesión');
  if (process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
    log.warn(
      'Tienes CONTENTFUL_MANAGEMENT_TOKEN definida: mientras exista, se usa esa y no el token que guardes aquí.',
    );
  } else if (hasSession()) {
    log.info(`Ya hay un token en ${sessionFile()}: el que pegues lo reemplaza.`);
  }
  if (await logIn(args, '¿Cómo quieres entrar?')) printOutro('Sesión lista.');
  return 0;
}

/**
 * `cfm logout`: quita el token guardado en este equipo, como `contentful logout`. Pide confirmar
 * porque el archivo es el mismo del Contentful CLI: también cierra esa sesión.
 */
export async function logout(): Promise<number> {
  printTitle('Cerrar sesión');
  const fromEnv = Boolean(process.env.CONTENTFUL_MANAGEMENT_TOKEN);
  const file = savedTokenFile();
  if (!file) {
    printOutro(
      fromEnv
        ? 'No hay un token guardado en este equipo: el que usas viene de CONTENTFUL_MANAGEMENT_TOKEN (quítala de tu terminal).'
        : 'No hay una sesión guardada en este equipo.',
    );
    return 0;
  }
  log.warn(`Se borra el token guardado en ${file}. Es el archivo del Contentful CLI: también cierra esa sesión.`);
  if (!(await askYesNo('¿Cerrar la sesión?', true))) {
    printCancelled();
    return 0;
  }
  forgetToken();
  log.ok(`Sesión cerrada: la próxima vez que abras ${APP_NAME} te pide un token.`);
  log.info(`El token sigue existiendo en Contentful. Si no lo vas a usar más, revócalo en ${TOKENS_PAGE}`);
  if (fromEnv) log.warn('Todavía tienes CONTENTFUL_MANAGEMENT_TOKEN definida: mientras exista, se sigue usando.');
  printOutro('Listo.');
  return 0;
}
