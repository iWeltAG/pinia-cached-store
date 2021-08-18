import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: [
    {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
  ],
  external: ['vue', 'pinia', 'json-stable-stringify'],
  plugins: [
    typescript({
      sourceMap: true,
      declaration: true,
      declarationMap: true,
    }),
  ],
};
