const fs = require('fs')
const path = require('path')

const resolve = require('rollup-plugin-node-resolve')
const commonjs = require('rollup-plugin-commonjs')
const babel = require('rollup-plugin-babel')
const builtins = require('rollup-plugin-node-builtins')
const {uglify} = require('rollup-plugin-uglify')

module.exports = {
  input: 'src/index.js',
  output: {
    name: 'prototipo',
    file: 'dist/index.bundle.js',
    format: 'iife',
  },
  watch: {},
  plugins: [
    resolve(),
    commonjs(),
    // babel({
    //   exclude: 'node_modules/**'
    // }),
    babel({
      presets: [
        ['@babel/preset-env', {
          // useBuiltIns: 'usage'
        }]
      ],
      plugins: [
        '@babel/plugin-proposal-object-rest-spread'
      ],
    }),

    builtins(),
    uglify(),
  ],
}
