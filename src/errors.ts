import { RawDoctext } from './RawReader.js'
import { Callsite, Doctext } from './types.js'

export class DoctextError extends Error {

  constructor(
    message: string,
    public readonly options: DoctextErrorOptions = {}
  ) {
    super(message, options)
  }

  public static wrap(error: unknown, file?: string, lineno?: number) {
    if (error instanceof DoctextError) {
      return error
    } else if (error instanceof Error) {
      return new DoctextError(error.message, {file, lineno, cause: error})
    } else {
      return new DoctextError(`${error}`, {file, lineno, cause: error})
    }
  }

}

export class UnableToDetermineCallsite extends DoctextError {

  constructor(
    public readonly stackFrame: string
  ) {
    super(`Could not determine the callsite of doctext()`)
  }

}

export class ObjectLiteralNotFound extends DoctextError {

  constructor(
    message: string,
    public readonly callsite: Callsite
  ) {
    super(message)
  }

}

export class UnknownEntity extends DoctextError {

  constructor(
    public readonly entity: string,
    public readonly doctext: RawDoctext
  ) {
    super(`Unknown entity: ${entity}`)
  }

}

export class InvalidEntity extends DoctextError {

  constructor(
    public readonly message: string,
    public readonly doctext: RawDoctext
  ) {
    super(message)
  }

}

export class ReferencedKeyNotFound extends DoctextError {
  
  constructor(
    public readonly key: string,
    public readonly doctext: Doctext<any>
  ) {
    super(`Referenced key not found: ${key}`)
  }
  
}

export interface DoctextErrorOptions extends ErrorOptions {
  file?:   string
  lineno?: number
}
