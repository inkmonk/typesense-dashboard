// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read package.json to get version info
const packageJson = JSON.parse(readFileSync(resolve('./package.json'), 'utf-8'));

const devApiProxyTarget = import.meta.env.DEV_API_PROXY_TARGET;

// Printo sign-in and gateway settings, baked into the build (see CLAUDE.md). Config-time values
// come from the environment (or .env.deploy via deploy.sh); the client reads them as
// import.meta.env.<NAME> through build.defineEnv below.
const printoEnv = (ctx: { mode: { electron?: boolean }; dev?: boolean }) => ({
  // Web builds call PIA through the same host (/pia/ in nginx, and the dev-server proxy below):
  // PIA's CORS preflight carries two Access-Control-Allow-Origin values, which browsers reject.
  // Electron has no page origin to protect, so it calls PIA directly.
  PIA_API_URL:
    import.meta.env.PIA_API_URL ??
    (ctx.mode.electron ? 'https://pia.printo.in/api/v1' : '/pia/api/v1'),
  // dev serves /v1 through the dev-server proxy below, because the live server's CORS preflight
  // rejects http://localhost
  TYPESENSE_API_URL:
    import.meta.env.TYPESENSE_API_URL ??
    (ctx.dev ? 'http://localhost:9000/v1' : 'https://typesense.printo.in/v1'),
  // public OAuth client ID (not a secret); empty hides the Google button
  GOOGLE_CLIENT_ID:
    import.meta.env.GOOGLE_CLIENT_ID ??
    '875434468582-2a7h0gahc6sq6jm3gfmre9cca1lhh0p7.apps.googleusercontent.com',
  // Web builds sign in through PIA only. Electron (any server) and the Docker image keep the
  // host + API key form. Set ENABLE_API_KEY_LOGIN=true for one build to bring the tab back.
  ENABLE_API_KEY_LOGIN:
    import.meta.env.ENABLE_API_KEY_LOGIN ?? (ctx.mode.electron ? 'true' : 'false'),
});

export default defineConfig((ctx) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['instantsearch', 'darkmode', 'checkAutoLoginConfig'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
      'material-symbols-sharp',
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },

      typescript: {
        strict: true,
        vueShim: true,
        // extendTsConfig (tsConfig) {}
      },

      // Web build: clean URLs (/dashboard/collections). Electron loads from file://, which needs
      // hash. The Docker image (Caddy file-server has no SPA fallback) sets VUE_ROUTER_MODE=hash.
      vueRouterMode:
        (import.meta.env.VUE_ROUTER_MODE as 'hash' | 'history' | undefined) ??
        (ctx.mode.electron ? 'hash' : 'history'),
      // vueRouterBase,
      // vueDevtools,
      // Required by vue-instantsearch 4.x, whose Ais components use the Options API.
      vueOptionsAPI: true,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // publicPath: '/',
      publicPath: import.meta.env.PUBLIC_PATH ?? (ctx.dev ? '/' : '/dashboard'),
      // deploy.sh builds into a scratch folder (DIST_DIR) so the live site keeps serving
      ...(import.meta.env.DIST_DIR ? { distDir: import.meta.env.DIST_DIR } : {}),
      defineEnv: {
        APP_VERSION: packageJson.version,
        ...printoEnv(ctx),
      },
      // define: {}
      // ignorePublicFolder: true,
      // minify: false,

      // extendViteConf (viteConf) {},
      // viteVuePluginOptions: {},

      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // https: true,
      open: true, // opens browser window automatically
      proxy: {
        // same-origin /v1 and /pia for local testing against the live hosts (no CORS involved)
        '/v1': { target: 'https://typesense.printo.in', changeOrigin: true, secure: true },
        '/pia': {
          target: 'https://pia.printo.in',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/pia/, ''),
        },
        ...(devApiProxyTarget
          ? {
              '/api': {
                target: devApiProxyTarget,
                changeOrigin: true,
                secure: false,
                rewrite: (path: string) => path.replace(/^\/api/, ''),
              },
            }
          : {}),
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {
        dark: 'auto',
      },

      // iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ['LocalStorage', 'Dialog', 'Loading', 'Notify'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   pwaRegisterServiceWorker: 'src-pwa/register-service-worker',
    //   pwaServiceWorker: 'src-pwa/custom-service-worker',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    //   bexManifestFile: 'src-bex/manifest.json
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        'render', // keep this as last one
      ],

      // extendSSRPackageJson (json) {},
      // extendSSRWebserverConf (rolldownConf) {},

      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      pwa: false,
      // pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!

      // extendSSRGenerateSWOptions (cfg) {},
      // extendSSRInjectManifestOptions (cfg) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      // swFilename: 'sw.js',
      // manifestFilename: 'manifest.json',
      // extendPWAManifestJson (json) {},
      // useCredentialsForManifestTag: true,
      // injectPWAMetaTags: false,
      // extendPWACustomSWConf (rolldownConf) {},
      // extendPWAGenerateSWOptions (cfg) {},
      // extendPWAInjectManifestOptions (cfg) {}
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {},

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true,
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (rolldownConf) {},
      // extendElectronPreloadConf (rolldownConf) {},

      // extendElectronPackageJson (json) {},

      // Electron preload scripts (if any) from /src-electron, WITHOUT file extension
      preloadScripts: ['electron-preload'],

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: 'packager', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',
        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        // https://www.electron.build/configuration/configuration

        appId: 'typesense-dashboard',
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      // extendBexScriptsConf (rolldownConf) {},
      // extendBexManifestJson (json) {},

      /**
       * The list of extra scripts (js/ts) not in your bex manifest that you want to
       * compile and use in your browser extension. Maybe dynamic use them?
       *
       * Each entry in the list should be a relative filename to /src-bex/
       *
       * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
       */
      extraScripts: [],
    },
  };
});
