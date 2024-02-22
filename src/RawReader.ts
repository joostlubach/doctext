import * as Acorn from 'acorn'
import { tsPlugin } from 'acorn-typescript'
import { escapeRegExp } from 'lodash'

import config from './config'
import { ObjectLiteralNotFound } from './errors'
import { Callsite, DoctextOptions } from './types'
import { findNode, walk } from './walkers'

const TsParser = Acorn.Parser.extend(tsPlugin() as any)

export default class RawReader {

  // #region Construction & properties

  constructor(
    private readonly source: string,
    private readonly callsite: Callsite,
    options: DoctextOptions = {}
  ) {
    this.config = {...config, ...options}

    if (this.config.marker === 'jsdoc') {
      this.markerRegExp = /^[*/]([\w\W]*?)(?:\*)?$/
    } else {
      const marker = escapeRegExp(this.config.marker)
      this.markerRegExp = new RegExp(`${marker}([\\w\\W]*?)(?:${marker}|$)`)
    }
  }

  private readonly config: Required<DoctextOptions>

  private readonly markerRegExp: RegExp

  // #endregion

  // #region Interface

  public read(): RawReadResult {
    const [program, comments] = this.parse()

    const objectNode = this.findObjectExpression(program)
    const documentables = this.findDocumentables(objectNode)
    const doctexts = this.findDoctexts(comments.filter(comment => {
      if (comment.loc == null || objectNode.loc == null) { return false }
      if (comment.loc.start.line < objectNode.loc.start.line) { return false }
      if (comment.loc.end.line > objectNode.loc.end.line) { return false }
      return true
    }))

    const [matchedArray, unmatched] = this.matchDocumentablesWithDoctexts(documentables, doctexts)

    const matched: RawDoctextDictionary = {}
    const undocumentedKeys: string[] = []
    for (const [documentable, doctext] of matchedArray) {
      if (doctext == null) {
        undocumentedKeys.push(documentable.key)
      } else {
        matched[documentable.key] = doctext
      }
    }

    return {
      matched,
      undocumentedKeys,
      unmatched,
    }
  }

  // #endregion

  // #region Parsing

  private parse(): [Acorn.Program, Acorn.Comment[]] {
    const comments: Acorn.Comment[] = []
    const program = TsParser.parse(this.source, {
      ecmaVersion: 'latest',
      locations:   true,
      sourceType:  'module',
      onComment:   comments,
    })

    return [program, comments]
  }

  private findObjectExpression(program: Acorn.Program): Acorn.ObjectExpression {
    const callNode = findNode<Acorn.CallExpression>(program, node => {
      if (node.loc == null) { return false }
      if (node.loc.start.line !== this.callsite.lineno) { return false }

      if (node.type !== 'CallExpression') { return false }

      if (this.callsite.functionName != null) {
        const callee = (node as Acorn.CallExpression).callee
        if (callee.type === 'Identifier') {
          if (callee.name !== this.callsite.functionName) { return false }
        } else if (callee.type === 'MemberExpression') {
          if (callee.property.type !== 'Identifier') { return false }
          if (callee.property.name !== this.callsite.functionName) { return false }
        } else {
          return false
        }
      }

      return true
    })
    if (callNode == null) {
      throw new ObjectLiteralNotFound("Could not find CallExpression node", this.callsite)
    }

    if (callNode.arguments.length !== 1) {
      throw new ObjectLiteralNotFound("doctext() must be called with a single argument", this.callsite)
    }
    if (callNode.arguments[0].type !== 'ObjectExpression') {
      throw new ObjectLiteralNotFound("the argument doctext() must be the literal resource config object", this.callsite)
    }

    return callNode.arguments[0] as Acorn.ObjectExpression
  }

  // #endregion

  // #region Comments & Doctexts

  private findDoctexts(comments: Acorn.Comment[]): RawDoctext[] {
    const doctexts: RawDoctext[] = []
    const appendDoctext = (doctext: RawDoctext | null) => {
      if (doctext != null) {
        doctexts.push(doctext)
      }
    }

    let lastCommentEnd: number | null = null
    let current: Acorn.Comment[] = []
    for (const comment of comments) {
      if (comment.loc == null) { continue }

      if (lastCommentEnd != null && comment.loc.start.line > lastCommentEnd + 1 && current.length > 0) {
        appendDoctext(this.mergeComments(current))
        current = []
      }
      current.push(comment)
      lastCommentEnd = comment.loc.end.line
    }

    if (current.length > 0) {
      appendDoctext(this.mergeComments(current))
    }

    return doctexts
  }
  
  private mergeComments(nodes: Acorn.Comment[]): RawDoctext | null {
    if (nodes.length === 0) { return null }

    const lineno = nodes[0].loc?.start.line
    if (lineno == null) { return null }

    // Build a full text from all nodes.
    const fullText = nodes.map(it => it.value).join('\n')

    // Match this to extract the """-delimited (or other marker) doctext.
    const match = fullText.match(this.markerRegExp)
    if (match == null) { return null }

    let lines = match[1].split('\n')

    if (nodes[0].type === 'Block') {
      // Remove leading spaces and an asterisk (/**...*/ style comments prefix all lines with an asterisk).
      lines = lines.map(it => it.replace(/^\s*\*/, ''))
    } else if (this.config.marker === 'jsdoc') {
      // Remove leading spaces and a single slash to support triple slash multiline comments.
      lines = lines.map(it => it.replace(/^\s*\//, ''))
    }

    // Strip common indent at the start.
    const startIndentLength = Math.min(...lines
      .filter(it => it !== '')
      .map(it => it.match(/^\s*/)?.[0].length ?? 0)
    )

    // Collapse spaces and trim the end.
    lines = lines.map(it => it.slice(startIndentLength))
    lines = lines.map(it => it.replace(/(\S.*)\s{2,}/, '$1 ').trimEnd())

    // Remove any leading or trailing blank lines only.
    while (lines.length > 0 && lines[0] === '') { lines.shift() }
    while (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop() }

    const separate = lines[lines.length - 1] === SEPARATOR
    if (separate) {
      lines.pop()
      while (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop() }
    }

    return {
      lineno,
      lines,
      separate,
      nodes,
    }
  }

  // #endregion

  // #region Documentables

  private findDocumentables(config: Acorn.ObjectExpression): Documentable[] {
    const documentables: Documentable[] = []

    walk(config, (node, ancestors) => {
      if (node.loc == null) { return }
      if (node.type !== 'Property') { return }

      const key = this.nestedPropertyKey([...ancestors, node])
      if (key == null) { return }
      if (!this.isKeyIncluded(key)) { return }

      documentables.push({
        key, 
        line: node.loc.start.line,
        node: node as Acorn.Property,
      })
    })

    return documentables
  }

  private isKeyIncluded(key: string): boolean {
    const {whitelist, blacklist} = this.config

    const matches = (pattern: string | RegExp) => {
      if (pattern instanceof RegExp) {
        return pattern.test(key)
      } else {
        return pattern === key
      }
    }

    // If the key is in the blacklist, it's always excluded.
    if (blacklist.some(matches)) { return false }
    
    // If no whitelist is specified, everything is included.
    if (whitelist.length === 0) { return true }

    // Otherwise, the key must be in the whitelist.
    return whitelist.some(matches)
  }
  
  private matchDocumentablesWithDoctexts(documentables: Documentable[], doctexts: RawDoctext[]): [Array<[Documentable, RawDoctext | null]>, RawDoctext[]] {
    const matched: Array<[Documentable, RawDoctext | null]> = []
    const reversed = doctexts.filter(it => !it.separate).reverse()
    const unmatched: RawDoctext[] = [...doctexts]

    const findClosestDoctext = (line: number, prevLine: number) => {
      for (const doctext of reversed) {
        if (doctext.lineno < prevLine) { break }
        if (doctext.lineno < line) {
          unmatched.splice(unmatched.indexOf(doctext), 1)
          return doctext
        }
      }

      return null
    }

    let prevLine: number = -1
    for (const documentable of documentables) {
      const doctext = findClosestDoctext(documentable.line, prevLine)
      prevLine = documentable.line

      if (doctext != null) {
        matched.push([documentable, doctext])
      } else {
        matched.push([documentable, null])
      }
    }

    return [matched, unmatched]
  }

  private nestedPropertyKey(ancestors: Acorn.Node[]): string | null {
    let keys: string[] = []
    for (const node of ancestors) {
      if (node.type === 'Property') {
        const keyNode = (node as Acorn.Property).key

        // For some reason, if the property value is a function (method), the key node is not an Identifier
        // but a direct Literal.
        if (keyNode.type === 'Identifier') {
          keys.push(keyNode.name)
        } else if (keyNode.type === 'Literal' && typeof keyNode.value === 'string') {
          keys.push(keyNode.value as string)
        }
      }
      if (!['Property', 'ObjectExpression'].includes(node.type)) {
        return null
      }
    }

    return keys.join('.')
  }

  // #endregion

}

export interface Documentable {
  key:  string
  line: number
  node: Acorn.Property
}

export interface RawReadResult {
  matched:          RawDoctextDictionary
  unmatched:        RawDoctext[]
  undocumentedKeys: string[]
}

export type RawDoctextDictionary = {
  [key: string]: RawDoctext
}

export interface RawDoctext {
  lineno:   number
  lines:    string[]
  separate: boolean
  nodes:    Acorn.Comment[]
}

export namespace RawDoctext {
  export function is(value: any): value is RawDoctext {
    return value != null
      && Array.isArray(value.lines)
      && typeof value.lineno === 'number'
      && Array.isArray(value.nodes)
  }
}

const SEPARATOR = '---'