import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
import { useNodeStore } from '@/stores/node';

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter(function ({ store }) {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  // Bookmarks from the hash-mode days (/dashboard/#/collections) open as /dashboard/collections.
  if (!import.meta.env.QUASAR_SERVER && import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history') {
    const base = (import.meta.env.QUASAR_VUE_ROUTER_BASE ?? '/').replace(/\/$/, '');
    if (window.location.hash.startsWith('#/')) {
      window.history.replaceState(null, '', base + window.location.hash.slice(1));
    }
  }

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
  });

  // A saved session is re-checked once on startup, before the first navigation resolves, so a
  // reload does not bounce through the login page while the check is still running.
  let sessionRestored = false;

  Router.beforeEach(async (to) => {
    const nodeStore = useNodeStore(store);
    if (to.name !== 'Login' && !nodeStore.isConnected && nodeStore.loginData && !sessionRestored) {
      sessionRestored = true;
      nodeStore.setPreviousRoute(to);
      await nodeStore.connectionCheck();
    }
    if (to.name !== 'Login' && !nodeStore.isConnected) {
      nodeStore.setPreviousRoute(to);
      return { name: 'Login' };
    }
    // Read-only users have no API Keys page and no Add Documents page.
    if (
      !nodeStore.canWrite &&
      (to.path === '/apikeys' || /^\/collection\/[^/]+\/document$/.test(to.path))
    ) {
      return { path: '/' };
    }
    if (to.params.name) {
      if (!nodeStore.currentCollection || nodeStore.currentCollection.name !== to.params.name) {
        // TODO check await needed?
        void nodeStore.loadCurrentCollectionByName(to.params.name as string);
      }
    }
    return true;
  });

  return Router;
});
