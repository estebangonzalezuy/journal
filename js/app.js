import { load, subscribe } from './store.js';
import { $, $$ } from './ui.js';
import renderResumen from './views/resumen.js';
import renderImportar from './views/importar.js';
import renderMovimientos from './views/movimientos.js';
import renderHistorico from './views/historico.js';
import renderAjustes from './views/ajustes.js';

const ROUTES = {
  resumen: renderResumen,
  importar: renderImportar,
  movimientos: renderMovimientos,
  historico: renderHistorico,
  ajustes: renderAjustes,
};

function currentRoute() {
  const name = (location.hash.replace('#/', '') || 'resumen').split('?')[0];
  return ROUTES[name] ? name : 'resumen';
}

function render() {
  const name = currentRoute();
  const view = $('#view');
  view.innerHTML = '';
  $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
  try {
    view.append(ROUTES[name]());
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="notice">Algo falló al dibujar esta pantalla: ${err.message}</div>`;
  }
  window.scrollTo(0, 0);
}

load();
addEventListener('hashchange', render);
// Re-render on state changes, except while the import review screen is mid-edit.
subscribe(() => { if (currentRoute() !== 'importar') render(); });
render();
