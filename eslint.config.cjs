const FS = require('fs')
const yaml = require('yaml')

module.exports = {
  languageOptions: {
    globals: {
      es6: true,
      browser: false,
    },
    
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      project: 'tsconfig.json',
      tsconfigRootDir: __dirname,
      sourceType: 'module',
    }
  },

  plugins: {
    '@stylistic': require('@stylistic/eslint-plugin'),
    '@mosdev': require('@mosdev/eslint-plugin')
  },

  files: [
    'src/**/*.ts',
  ],

  ignores: [
    'bin',
    'dist',
    'node_modules',
    'eslint.config.js',
    'tsconfig.json'
  ],

  rules: yaml.parse(FS.readFileSync('../../eslint.rules.yml', 'utf-8'))
};