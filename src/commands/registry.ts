/**
 * Qué función corre cada comando. Los nombres, textos del menú y flags están en
 * cli-args.ts; TypeScript exige que cada comando tenga su función acá.
 */
import type { CliArgs, Command } from '../cli-args.ts';
import { compareEntry } from './compare-entry.ts';
import { compareModelsCommand } from './compare-models.ts';
import { history } from './history.ts';
import { login, logout } from './login.ts';
import { migrate } from './migrate.ts';
import { migrateAssets } from './migrate-assets.ts';
import { migrateModel } from './migrate-model.ts';
import { restore } from './restore.ts';
import { status } from './status.ts';

export const RUNNERS: Record<Command, (args: CliArgs) => Promise<number>> = {
  migrate,
  'migrate-model': migrateModel,
  'migrate-assets': migrateAssets,
  'compare-models': compareModelsCommand,
  'compare-entry': compareEntry,
  status,
  history,
  restore,
  login,
  logout,
};
