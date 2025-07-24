import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './global.css';

// Clear any existing demo user data and recipes to start fresh
localStorage.removeItem('FridgeCHef_user');
localStorage.removeItem('FridgeCHef_recipes');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
