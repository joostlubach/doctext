
import { escapeRegExp } from 'lodash'

import { RawDoctext } from './RawReader'
import { InvalidEntity, UnknownEntity } from './errors'
import { Doctext, Entities, EntitySpec, ParseUtil } from './types'

export default class DoctextParser<E extends Entities> {

  public constructor(
    private readonly entities: Record<string, EntitySpec<E>>,
  ) {}

  public parse(raw: RawDoctext): Doctext<E> {
    const {lineno, lines, nodes} = raw
    const util = createUtil(raw)
    const [entities, rest] = this.extractEntities(raw, lines, util)

    const summary = util.summary(rest)
    const body = util.body(rest)

    return {
      lineno,
      summary,
      body,
      entities,
      nodes,
    }
  }

  private extractEntities(doctext: RawDoctext, lines: string[], util: ParseUtil): [E, string[]] {
    const entities = {} as E
    const rest: string[] = []

    const addEntity = (meta: EntitySpec<E>, args: string[], lines: string[]) => {
      meta.add(entities, args, lines, util)
    }

    let current: {
      meta:  EntitySpec<E>,
      args:  string[],
      lines: string[]
    } | undefined

    entity: for (const [index, line] of lines.entries()) {
      if (line.match(ENTITY_CONTENT_RE) || (line === '' && current != null)) {
        if (current == null) {
          rest.push(line)
        } else {
          current.lines.push(line.replace(/^\s{2}/, '').trimEnd())
        }
        continue entity
      }

      // If the line does not match an entity line, add it to the rest lines and continue.
      const match = line.match(ENTITY_RE)
      if (match == null) {
        rest.push(line)
        continue entity
      }

      // If this is a match and there is a current entity, add it first.
      if (current != null) {
        addEntity(current.meta, current.args, current.lines)
      }

      // Parse the entity and look it up.
      const entity = match[1]
      const meta = this.entities[entity]
      if (meta == null) {
        throw new UnknownEntity(entity, doctext)
      }

      current = {
        meta,
        args:  [],
        lines: [],
      }

      let remainder = match[2] ?? ''

      // If the entity has arguments, parse them.
      for (let i = 0; i < meta.args; i++) {
        const match = remainder.match(/\s*(\S+)(?:\s+(.*)|$)/)
        if (match == null) {
          throw new InvalidEntity(`Missing argument for @${entity}`, doctext)
        }

        current.args.push(match[1])
        remainder = match[2] ?? ''
      }

      if (remainder.trim().length > 0) {
        if (!meta.content) {
          throw new InvalidEntity(`Unexpected content for @${entity}`, doctext)
        }
        
        current.lines = [remainder.trim()]
        addEntity(current.meta, current.args, current.lines)
        current = undefined
      } else if (!meta.content) {
        addEntity(meta, current.args, current.lines)
        current = undefined
      }
    }

    if (current != null) {
      addEntity(current.meta, current.args, current.lines)
    }

    return [entities, rest]
  }

}

function createUtil(doctext: RawDoctext): ParseUtil {
  return {
    summary: lines => {
      const blankIndex = lines.findIndex(it => it.trim() === '')
      return (blankIndex < 0 ? lines : lines.slice(0, blankIndex))
        .join(' ')
        .replace(/\s{2,}/, ' ')
        .trim()
    },
    
    body: (lines, skipEntities = false) => {
      const body = lines.join(' ').replace(/\s{2,}/, ' ').trim()
      if (skipEntities) {
        return body.replace(/@(\w+).*(?:\n\s{2,}.*)*/g, '').trim()
      } else {
        return body
      }
    },
    
    entities: (lines, name) => {
      const namePattern = escapeRegExp(name)
      const regexp = new RegExp(`@${namePattern}\\s*(.*)((?:\\n\\s{2}.*)*)`, 'g')
      const matches = lines.join('\n').matchAll(regexp)
      return [...matches].map(match => {
        const value = match[1]
        const nested = match[2].replace(/\n/g, ' ')
        return (value + nested).replace(/\s{2,}/, ' ').trim()
      })
    },

    nested: lines => ({
      lines:    lines,
      lineno:   doctext.lineno,
      separate: false,
      nodes:    doctext.nodes,
    }),
  }
}

const ENTITY_RE = /^\s*@(\w+)(?:\s+(.*?))?$/
const ENTITY_CONTENT_RE = /^\s{2,}(.*)$/
