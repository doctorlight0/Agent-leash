import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

function isRustTargetPath(importPath) {
  if (typeof importPath !== 'string') return false
  const normalized = path.normalize(importPath)
  return (
    // Relative paths from project root
    normalized.startsWith('contracts/near/target') ||
    normalized.startsWith('contracts/near/test-target') ||
    normalized.startsWith('contracts/near/target-wasm') ||
    normalized.startsWith('contracts/near/target-x86') ||
    normalized.startsWith('contracts/near/target-x86_64') ||
    normalized.startsWith('target') ||
    normalized.includes('/.fingerprint/') ||
    // Absolute paths
    normalized.includes('/contracts/near/target') ||
    normalized.includes('/contracts/near/test-target') ||
    normalized.includes('/contracts/near/target-wasm') ||
    normalized.includes('/contracts/near/target-x86') ||
    normalized.includes('/target/')
  )
}

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    watch: {
      ignored(importPath) {
        if (typeof importPath !== 'string') return false
        return isRustTargetPath(importPath)
      },
      poll: true,
    },
  },
})