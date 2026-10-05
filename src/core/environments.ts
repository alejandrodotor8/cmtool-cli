import type { Environment } from '../contentful/types.ts';

/** ID del ambiente que corresponde a un nombre: su ID o uno de sus aliases (`master`). */
export function resolveEnvironment(envs: Environment[], name: string): string | undefined {
  return envs.find((e) => e.id === name)?.id ?? envs.find((e) => e.aliases.includes(name))?.id;
}
