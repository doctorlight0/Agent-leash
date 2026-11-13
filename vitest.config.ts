import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  server: {
  watch: {
    ignored: [
      '**/contracts/near/target/**',
      '**/contracts/near/target-x86/**',
      '**/contracts/near/test-target/**',
      '**/node_modules/**',
      '**/.git/**',
    ],
  },
},
});
