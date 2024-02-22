
import { RawDoctext } from './RawReader'
import config from './config'
import { InvalidEntity, UnknownEntity } from './errors'
import { Doctext, Entities, EntityParseUtil, EntitySpec } from './types'

export default class DoctextParser<E extends Entities> {

  public constructor(
    private readonly entities: Record<string, EntitySpec> = config.entities
  ) {}

  public parse(raw: RawDoctext): Doctext<E> {
    const {lineno, lines, nodes} = raw
    const [entities, rest] = this.extractEntities(raw, lines)
    const {summary, description} = this.parseDoctextLines(rest)

    return {
      lineno,
      summary,
      description,
      entities,
      nodes,
    }
  }

  private extractEntities(doctext: RawDoctext, lines: string[]): [E, string[]] {
    const entities = {} as E
    const rest: string[] = []

    const util: EntityParseUtil = {
      merge: lines => lines.join(' ').replace(/\s{2,}/, ' ').trim(),
      raw:   lines => ({
        lines:    lines,
        lineno:   doctext.lineno,
        separate: false,
        nodes:    doctext.nodes,
      }),
    }

    const addEntity = (meta: EntitySpec, args: string[], lines: string[]) => {
      meta.add(entities, args, lines, util)
    }

    let current: {
      meta:  EntitySpec,
      args:  string[],
      lines: string[]
    } | undefined

    entity: for (const [index, line] of lines.entries()) {
      if (line.match(ENTITY_CONTENT_RE) || (line === '' && current != null)) {
        if (current == null) {
          throw new InvalidEntity(`Unxpected entity content line at ${index + 1}`, doctext)
        }
        current.lines.push(line.trim())
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

  private parseDoctextLines(lines: string[]) {
    // The description is the full text, but with newlines replaced with spaces.
    const description = lines.join(' ').replace(/\s+/g, ' ').trim()

    // The summary is only the first few lines until there is an explicit blank line.
    const blankLineIndex = lines.findIndex(it => it === '')
    const summary = blankLineIndex < 0
      ? description
      : lines.slice(0, blankLineIndex).join(' ').replace(/\s+/, ' ').trim()

    return {summary, description}
  }

}

const ENTITY_RE = /^\s*@(\w+)(?:\s+(.*?))?$/
const ENTITY_CONTENT_RE = /^\s{2,}(.*)$/