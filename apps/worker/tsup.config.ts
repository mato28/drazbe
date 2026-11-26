import { defineConfig } from 'tsup';

// Bundle the worker and ALL its dependencies (incl. workspace packages, which ship as TS source)
// into a single file, so the production image needs no node_modules.
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli/verify-auction.ts',
    'src/cli/migrate.ts',
    'src/cli/seed.ts',
    'src/cli/demo-auction.ts',
    'src/cli/demo-bot.ts',
  ],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  banner: {
    // Allow bundled CommonJS deps to `require` Node built-ins from an ESM bundle.
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
