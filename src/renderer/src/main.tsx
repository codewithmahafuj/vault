import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Root container is missing');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
