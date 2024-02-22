import * as FS from 'fs-extra'
import { cloneDeep, isPlainObject, mapValues, pick } from 'lodash'
import { objectEntries } from 'ytil'

import DoctextParser from './DoctextParser'
import RawReader, { RawReadResult } from './RawReader'
import { DoctextError, ReferencedKeyNotFound, UnableToDetermineCallsite } from './errors'
import { Doctext, DoctextDictionary, DoctextOptions, Entities, ReadResult } from './types'

export default class DoctextReader<E extends Entities = Entities> {

  private constructor(
    private readonly callee: Function | undefined,
    private readonly options: DoctextOptions = {}
  ) {
    this.parser = new DoctextParser(this.options.entities)
  }

  private readonly parser: DoctextParser<E>

  public static create<E extends Entities>(callee: Function, options?: DoctextOptions): DoctextReader<E>
  public static create<E extends Entities>(options?: DoctextOptions): DoctextReader<E>
  public static create(...args: any[]) {
    const options = isPlainObject(args[args.length - 1]) ? args.pop() : {}
    const callee = args[0] ?? undefined
    return new DoctextReader(callee, options)
  }

  // #region Interface

  public readSync<O extends Record<string, any>>(_: O): ReadResult<E> {
    const callsite = this.callsite(this.readSync)
    try {
      const content = FS.readFileSync(callsite.file, 'utf8')  
      const reader = new RawReader(content, callsite, this.options)
      const raw = reader.read()
      return this.parseAndResolve(raw)
    } catch (error) {
      throw DoctextError.wrap(error, callsite.file, callsite.lineno)
    }
  }

  public async readAsync<O extends Record<string, any>>(_: O): Promise<ReadResult<E>> {
    const callsite = this.callsite(this.readAsync)
    try {
      const content = await FS.readFile(callsite.file, 'utf8')  
      const reader = new RawReader(content, callsite, this.options)
      const raw = reader.read()
      return this.parseAndResolve(raw)
    } catch (error) {
      throw DoctextError.wrap(error, callsite.file, callsite.lineno)
    }
  }

  // #endregion

  // #region Callsite
  
  private callsite(defaultCallee: Function) {
    const callee = this.callee ?? defaultCallee
    
    const tmp = {} as {stack: string}
    Error.captureStackTrace(tmp, callee)

    const frame = tmp.stack.split('\n')[1].trim()
    const match = frame.match(/(\/[^<>:"\\|?*()]+?):(\d+):(\d+)/)
    if (match == null) {
      throw new UnableToDetermineCallsite(frame)
    }

    return {
      file:         match[1],
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

      Object.assign(doctext, pick(original, 'summary', 'description'))
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