import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  external: ['react'],
});
