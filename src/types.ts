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

  /**
   * The entities to use when parsing doctext comments. These are keywords starting with `'@'` such as
   * `'@link' or '@copy'`. You can specify additional custom entities.
   * 
   * Refer to {@link ./entities.ts} for the default entities.
   */
  entities?: Record<string, EntitySpec>
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
  lineno:      number
  summary:     string
  description: string
  entities:    E
  nodes:       Acorn.Comment[]
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

export interface EntitySpec {
  args:    number
  content: boolean
  add:     (entities: Entities, args: string[], lines: string[], parser: EntityParseUtil) => void
}

export interface EntityParseUtil {
  merge: (lines: string[]) => string
  raw:   (lines: string[]) => RawDoctext
}