import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { Buffer } from 'buffer'

// Polyfill Buffer for browser environment
window.Buffer = Buffer

// Add BigInt serialization support
// @ts-ignore
BigInt.prototype.toJSON = function() {
  return this.toString();
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)