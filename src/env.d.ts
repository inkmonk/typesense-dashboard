declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
    PIA_API_URL: string;
    TYPESENSE_API_URL: string;
    GOOGLE_CLIENT_ID: string;
    ENABLE_API_KEY_LOGIN: string;
  }
}

declare module 'vue-instantsearch/vue3/es';
