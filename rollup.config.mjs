import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: [
    {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/index.min.js',
      format: 'es',
      sourcemap: true,
      plugins: [terser()],
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
