/* eslint-disable no-console */

import { DoctextOptions } from './types'

export interface Config extends Required<DoctextOptions> {
  logger: Logger
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config = {
  marker:    'jsdoc',
  whitelist: [],
  blacklist: [],

  logger: {
    debug: (...args) => process.env.DEBUG ? console.debug(...args) : undefined,
    info:  console.log,
    warn:  console.warn,
    error: console.error,
  },
}
export default config

export function configure(cfg: Partial<Config>) {
  Object.assign(config, cfg)
}
