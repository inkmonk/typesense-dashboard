/**
 * Custom environment variables used by the Quasar configuration and client.
 * Quasar supplies its own QUASAR_* declarations automatically.
 */
interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly DEV_API_PROXY_TARGET?: string;
  readonly PUBLIC_PATH?: string;
  // Printo sign-in / gateway (see quasar.config.ts)
  readonly PIA_API_URL: string;
  readonly TYPESENSE_API_URL: string;
  readonly GOOGLE_CLIENT_ID: string;
  readonly ENABLE_API_KEY_LOGIN: string;
  // build helpers read at config time only
  readonly DIST_DIR?: string;
  readonly VUE_ROUTER_MODE?: string;
}

declare module 'vue-instantsearch/vue3/es';
