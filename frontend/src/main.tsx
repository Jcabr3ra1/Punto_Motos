import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { InicioDesktop } from './desktop/InicioDesktop'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InicioDesktop><App /></InicioDesktop>
  </StrictMode>,
)
