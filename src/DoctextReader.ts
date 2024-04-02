import * as FS from 'fs-extra'
import { cloneDeep, isFunction, mapValues, pick } from 'lodash'
import { objectEntries } from 'ytil'

import DoctextParser from './DoctextParser.js'
import RawReader, { RawReadResult } from './RawReader.js'
import defaultEntities from './defaultEntities.js'
import { DoctextError, ReferencedKeyNotFound, UnableToDetermineCallsite } from './errors.js'
import {
  Callsite,
  Doctext,
  DoctextDictionary,
  DoctextOptions,
  Entities,
  EntitySpec,
  ReadResult,
} from './types.js'

export default class DoctextReader<E extends Entities = Entities> {

  private constructor(
    private readonly callee: Function | undefined,
    extraEntities: Record<string, EntitySpec<E>> = {},
    private readonly options: DoctextOptions = {}
  ) {
    this.parser = new DoctextParser<E>({
      ...defaultEntities,
      ...extraEntities,
    })
  }

  private readonly parser: DoctextParser<E>

  public static createWithEntities<E>(callee: Function, entities: Record<string, EntitySpec<Entities & E>>, options?: DoctextOptions): DoctextReader<Entities & E>
  public static createWithEntities<E>(entities: Record<string, EntitySpec<Entities & E>>, options?: DoctextOptions): DoctextReader<Entities & E>
  public static createWithEntities(...args: any[]) {
    const callee = isFunction(args[0]) ? args.shift() : undefined
    const entities = args.shift()
    const options = args.shift() ?? {}

    return new DoctextReader(callee, entities, options)
  }

  public static create(callee: Function, options?: DoctextOptions): DoctextReader<Entities>
  public static create(options?: DoctextOptions): DoctextReader<Entities>
  public static create(...args: any[]) {
    const callee = isFunction(args[0]) ? args.shift() : undefined
    const options = args.shift() ?? {}
    return new DoctextReader(callee, {}, options)
  }

  // #region Interface

  public readSync<O extends Record<string, any>>(_: O): ReadResult<E> {
    const callsite = this.deriveCallsite(this.readSync)
    try {
      const content = FS.readFileSync(callsite.path, 'utf8')  
      const reader = new RawReader(content, callsite, this.options)
      const raw = reader.read()
      return {
        callsite, 
        ...this.parseAndResolve(raw),
      }
    } catch (error) {
      throw DoctextError.wrap(error, callsite.path, callsite.lineno)
    }
  }

  public async readAsync<O extends Record<string, any>>(_: O): Promise<ReadResult<E>> {
    const callsite = this.deriveCallsite(this.readAsync)
    try {
      const content = await FS.readFile(callsite.path, 'utf8')  
      const reader = new RawReader(content, callsite, this.options)
      const raw = reader.read()
      return {
        callsite,
        ...this.parseAndResolve(raw),
      }
    } catch (error) {
      throw DoctextError.wrap(error, callsite.path, callsite.lineno)
    }
  }

  // #endregion

  // #region Callsite
  
  private deriveCallsite(defaultCallee: Function): Callsite {
    const callee = this.callee ?? defaultCallee
    
    const tmp = {} as {stack: string}
    Error.captureStackTrace(tmp, callee)

    const frame = tmp.stack.split('\n')[1].trim()
    const match = frame.match(/(\/[^<>:"\\|?*()]+?):(\d+):(\d+)/)
    if (match == null) {
      throw new UnableToDetermineCallsite(frame)
    }

    return {
      path:     match[1],
      lineno:       parseInt(match[2], 10),
      functionName: callee?.name,
    }  
  }

  // #endregion
  
  // #region Parsing & resolving

  private parseAndResolve(raw: RawReadResult) {
    const matched = mapValues(raw.matched, it => this.parser.parse(it))
    const unmatched = raw.unmatched.map(it => this.parser.parse(it))
    const undocumentedKeys = raw.undocumentedKeys
    
    this.resolveCopyDoctexts(matched)
    this.resolveProperties(matched, unmatched)
    return {matched, unmatched, undocumentedKeys}
  }

  private resolveCopyDoctexts(doctexts: DoctextDictionary<E>) {
    for (const [key, doctext] of objectEntries(doctexts)) {
      if (doctext?.entities?.copy == null) { continue }

      const original = doctexts[doctext.entities.copy]
      if (original == null) {
        throw new ReferencedKeyNotFound(doctext.entities.copy, doctext)
      }

      Object.assign(doctext, pick(original, 'summary', 'body'))
      doctext.entities = cloneDeep(original.entities)
    }
  }

  private resolveProperties(matched: DoctextDictionary<E>, unmatched: Doctext<E>[]) {
    const resolvePropsFor = (key: string | number | undefined, doctext: Doctext<E>) => {
      if (doctext?.entities?.properties == null) { return }

      for (const [propkey, propdoctext] of objectEntries(doctext.entities.properties)) {
        const fullkey = key == null ? propkey : `${key}.${propkey}`
        matched[fullkey] = this.parser.parse(propdoctext)
      }
    }

    for (const [key, doctext] of objectEntries(matched)) {
      resolvePropsFor(key, doctext)
    }

    for (const doctext of unmatched) {
      resolvePropsFor(undefined, doctext)
    }
  }

}
