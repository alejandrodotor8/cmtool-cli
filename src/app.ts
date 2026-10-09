/**
 * Datos de package.json. Se importan (no se leen del disco) para que queden dentro del build y
 * de los ejecutables, que no llevan package.json al lado.
 */
import pkg from '../package.json' with { type: 'json' };

/** Nombre del comando (el de package.json): se usa en todos los mensajes que muestran un comando. */
export const APP_NAME = pkg.name;
export const VERSION = pkg.version;
