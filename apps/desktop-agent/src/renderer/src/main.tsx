import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { createPreviewApi } from './preview-api';
import './styles.css';

if (!window.maxDesktop && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
  window.maxDesktop = createPreviewApi();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
