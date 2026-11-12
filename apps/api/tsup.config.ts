import { defineConfig } from 'tsup';

// Workspace packages export raw TypeScript, so Node can't load them from dist.
// Bundle them in. Prisma stays external because its engine ships as a native binary.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: [/^@haul\//, 'node-html-parser'],
});
