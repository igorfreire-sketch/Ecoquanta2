import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {APP_VERSION} from './config/appVersion.ts';
import './index.css';

const APP_VERSION_STORAGE_KEY = 'ecoquanta_app_version';
const APP_VERSION_RELOAD_KEY = 'ecoquanta_app_version_reloaded';

function clearOutdatedClientCaches() {
  try {
    localStorage.removeItem('quanta_global_data_cache');
    localStorage.removeItem('curvasAppData');
    sessionStorage.removeItem('curvasAppData');

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('quanta_registro_atividade_cache_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {}
}

function ensureFreshAppVersion() {
  try {
    const previousVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);
    const reloadedVersion = sessionStorage.getItem(APP_VERSION_RELOAD_KEY);

    if (!previousVersion) {
      localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);
      return true;
    }

    if (previousVersion !== APP_VERSION) {
      clearOutdatedClientCaches();
      localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);

      if (reloadedVersion !== APP_VERSION) {
        sessionStorage.setItem(APP_VERSION_RELOAD_KEY, APP_VERSION);
        window.location.reload();
        return false;
      }
    }
  } catch (error) {}

  return true;
}

if (ensureFreshAppVersion()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
