import '@fontsource-variable/baloo-bhaijaan-2'
import '@fontsource/amiri-quran'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './design/global.css'
import { requestPersistentStorage } from './services/db'

void requestPersistentStorage()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
