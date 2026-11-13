import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { NearWalletProvider } from './hooks/useNear'
import '@near-wallet-selector/modal-ui/styles.css'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NearWalletProvider>
        <App />
        <Toaster position="top-center" />
      </NearWalletProvider>
    </QueryClientProvider>
  </StrictMode>
)