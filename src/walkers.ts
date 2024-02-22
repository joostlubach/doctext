import * as Acorn from 'acorn'
import { isArray, isObject } from 'lodash'
import { objectValues } from 'ytil'

export function findNode<N extends Acorn.Node>(root: Acorn.Node, test: (node: Acorn.Node, ancestors: Acorn.Node[]) => boolean): N | null {
  let found: N | null = null
  const iter = (node: Acorn.Node, ancestors: Acorn.Node[]) => {
    if (test(node, ancestors)) {
      found = node as N
      return false
    }

    return recurseNode(node, [...ancestors, node], iter)
  }

  iter(root, [])
  return found
}

export function walk(root: Acorn.Node, visitor: (node: Acorn.Node, ancestors: Acorn.Node[]) => void) {
  const iter = (node: Acorn.Node, ancestors: Acorn.Node[]) => {
    visitor(node, ancestors)
    return recurseNode(node, [...ancestors, node], iter)
  }

  iter(root, [])
}

function recurseNode(node: Acorn.Node, ancestors: Acorn.Node[], iterator: (node: Acorn.Node, ancestors: Acorn.Node[]) => boolean) {
  for (const value of objectValues(node as any)) {
    if (isAcornNode(value)) {
      if (!iterator(value as Acorn.Node, ancestors)) {
        return false
      }
    } else if (isArray(value) && value.length > 0 && isAcornNode(value[0])) {
      for (const node of value) {
        if (!iterator(node, ancestors)) {
          return false
        }
      }
    }
  }

  return true
}

function isAcornNode(node: any): node is Acorn.Node {
  if (!isObject(node)) { return false }
  if (node.constructor?.name !== 'Node') { return false }
  if (!('type' in node) || !('loc' in node)) { return false }
  return true
}