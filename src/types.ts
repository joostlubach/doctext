import * as Acorn from 'acorn'

import { RawDoctext } from './RawReader'

export interface DoctextOptions {
  /**
   * The marker used to identify doctext comments. The default is `'jsdoc'`, which is the JSDoc standard of
   * using a `/**` to start a comment. Also, `'jsdoc'` supports `///` triple slash single line comments.
   */
  marker?: 'jsdoc' | string

  /**
   * A whitelist for property keys. If specified, any property key not in the whitelist will be ignored.
   */
  whitelist?: Array<string | RegExp>

  /**
   * A blacklist for property keys. If specified, any property key in the blacklist will be ignored.
   */
  blacklist?: Array<string | RegExp>
}

export interface ReadResult<E extends Entities = Entities> {
  matched:          DoctextDictionary<E>
  unmatched:        Doctext<E>[]
  undocumentedKeys: string[]
}

export type DoctextDictionary<E extends Entities> = {
  [key: string]: Doctext<E>
}

export interface Callsite {
  file:          string
  lineno:        number
  functionName?: string
}

export interface Doctext<E extends Entities = Entities> {
  lineno:   number
  summary:  string
  body:     string
  entities: E
  nodes:    Acorn.Comment[]
}

export interface Entities {
  links?:      DoctextLink[]
  copy?:       string
  properties?: Record<string, RawDoctext>
}

export interface DoctextLink {
  href:    string
  caption: string
}

export interface EntitySpec<E extends Entities> {
  args:    number
  content: boolean
  add:     (entities: E, args: string[], lines: string[], parser: ParseUtil) => void
}

export interface ParseUtil {

  /** Extracts a summary from all lines before the first blank line. */
  summary: (lines: string[]) => string

  /**
   * Merges all lines into a single body.
   * 
   * @param skipEntities If true, entities will be removed from the body.
   */
  body: (lines: string[], skipEntities?: boolean) => string

  /**
   * Extracts simple entities from the given lines.
   * 
   * @param lines The lines of text to parse.
   * @param name The name of the entity to extract.
   * @returns An array of strings representing the values of the entity.
   */
  entities: (lines: string[], name: string) => string[]

  /** Creates a new doctext from the given lines and the same metadata as the original doctext. */
  nested: (lines: string[]) => RawDoctext

}