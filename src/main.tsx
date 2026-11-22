import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import AppStartup from "@/components/AppStartup"
import { installStartupCache } from "@/lib/startup"
import App from './App.tsx'
import ErrorBoundary from '@/components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <ErrorBoundary><AppStartup><App /></AppStartup></ErrorBoundary>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)

installStartupCache();
