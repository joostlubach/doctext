import { Entities, EntitySpec } from './types.js'

const defaultEntities: Record<string, EntitySpec<Entities>> = {
  copy: {
    args:    1,
    content: false,
    
    add: (entities, args) => {
      entities.copy = args[0]
    },
  },
  property: {
    args:    1,
    content: true,
    
    add: (entities, args, lines, util) => {
      entities.properties ??= {}
      entities.properties[args[0]] = util.nested(lines)
    },
  },
  link: {
    args:    1,
    content: true,
    
    add: (entities, args, lines, util) => {
      const href = args[0]
      const caption = lines.length > 0 ? util.body(lines) : args[0]

      entities.links ??= []
      entities.links.push({href, caption})
    },
  },
}

export default defaultEntities
