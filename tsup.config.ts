import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  // The published file is an executable (the `flarelink-mcp` bin).
  banner: { js: '#!/usr/bin/env node' },
});
