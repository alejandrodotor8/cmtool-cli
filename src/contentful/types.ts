/** Tipos de Contentful con nombres cortos, y estructuras propias de la herramienta. */
import type {
  AssetProps,
  ContentFields,
  ContentTypeProps,
  EntryProps,
  PlainClientAPI,
  SpaceProps,
  TagProps,
} from 'contentful-management';

export type Cma = PlainClientAPI;
export type Space = SpaceProps;
export type Entry = EntryProps;
export type Asset = AssetProps;
export type ContentType = ContentTypeProps;
export type Field = ContentFields;
export type Tag = TagProps;
export type TagLink = NonNullable<Entry['metadata']>['tags'][number];

export interface Environment {
  id: string;
  /** Aliases que apuntan a este ambiente (por ejemplo, `master`). */
  aliases: string[];
}

export interface Locales {
  codes: Set<string>;
  default: string | undefined;
}

/** Entries leídas en origen a partir de las que pegaste, con sus hijos. */
export interface EntryTree {
  entries: Map<string, Entry>;
  children: Map<string, string[]>;
  /** Links a entries que no existen en origen. */
  broken: Set<string>;
}
