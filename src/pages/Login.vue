<template>
  <div class="login-page">
    <aside class="login-hero gt-sm">
      <div class="login-hero__inner">
        <div class="brand-row">
          <div class="brand-tile"><q-icon name="sym_s_database_search" size="32px" /></div>
          <span class="brand-row__divider"></span>
          <span class="logo-badge"><img :src="printoLogo" alt="Printo" /></span>
        </div>
        <h1 class="login-hero__title">Typesense Dashboard</h1>
        <p class="login-hero__lead">
          Browse collections, tune search and manage your Typesense data.
        </p>
        <ul class="login-hero__list">
          <li><q-icon name="sym_s_search" size="20px" />Search and inspect documents</li>
          <li><q-icon name="sym_s_schema" size="20px" />Collections, schemas and aliases</li>
          <li><q-icon name="sym_s_shield_lock" size="20px" />Signed in with your Printo account</li>
        </ul>
      </div>
    </aside>

    <main class="login-main">
      <div class="login-card">
        <div class="brand-row brand-row--card lt-md">
          <div class="brand-tile brand-tile--small"><q-icon name="sym_s_database_search" /></div>
          <span class="brand-row__divider"></span>
          <span class="logo-badge logo-badge--small"><img :src="printoLogo" alt="Printo" /></span>
        </div>

        <template v-if="tab === 'pia'">
          <h2 class="login-card__title">Welcome back</h2>
          <p class="login-card__sub">Sign in with your Printo account to continue.</p>

          <!-- Google renders its official button into this element -->
          <div v-if="googleClientId" ref="googleButton" class="google-slot"></div>

          <div v-if="googleClientId" class="divider"><span>or use your employee ID</span></div>

          <q-form class="login-form" @submit.prevent="signInWithPassword">
            <q-input
              v-model="employeeId"
              outlined
              class="login-field"
              label="Employee ID"
              autocomplete="username"
              :disable="loading"
            >
              <template #prepend><q-icon name="sym_s_badge" /></template>
            </q-input>
            <q-input
              v-model="password"
              outlined
              class="login-field"
              label="Password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              :disable="loading"
            >
              <template #prepend><q-icon name="sym_s_lock" /></template>
              <template #append>
                <q-icon
                  :name="showPassword ? 'sym_s_visibility_off' : 'sym_s_visibility'"
                  class="cursor-pointer"
                  @click="showPassword = !showPassword"
                />
              </template>
            </q-input>
            <q-btn
              unelevated
              no-caps
              color="primary"
              class="login-btn full-width"
              label="Sign in"
              type="submit"
              :loading="loading"
              :disable="!employeeId || !password"
            />
          </q-form>
        </template>

        <template v-else>
          <h2 class="login-card__title">Connect with an API key</h2>
          <p class="login-card__sub">
            <template v-if="$q.platform.is.electron">
              Requires a server with CORS enabled, for the search function only.
            </template>
            <template v-else>Requires a server with CORS enabled.</template>
          </p>
          <q-form class="login-form" @submit.prevent="loginWithApiKey()">
            <q-input
              v-model="state.apiKey"
              outlined
              class="login-field"
              type="password"
              autocomplete="off"
              label="API key"
            />
            <div class="row q-col-gutter-sm">
              <div class="col-5">
                <q-select
                  v-model="state.node.protocol"
                  outlined
                  class="login-field"
                  :options="state.protocolOptions"
                  label="Protocol"
                />
              </div>
              <div class="col-7">
                <q-input v-model="state.node.host" outlined class="login-field" label="Host" />
              </div>
              <div class="col-5">
                <q-input
                  v-model.number="state.node.port"
                  outlined
                  class="login-field"
                  type="number"
                  label="Port"
                />
              </div>
              <div class="col-7">
                <q-input v-model="state.node.path" outlined class="login-field" label="Path" />
              </div>
            </div>
            <p class="login-hint">
              Path is optional: leave blank, or start with / and end without /.
            </p>
            <q-toggle
              v-if="$q.platform.is.electron && state.node.protocol === 'https'"
              v-model="state.node.tls"
              label="Check TLS"
            />
            <div class="row no-wrap q-gutter-sm">
              <q-btn
                unelevated
                no-caps
                color="primary"
                class="login-btn col"
                label="Connect"
                type="submit"
              />
              <q-btn outline no-caps class="login-btn" icon="sym_s_history" aria-label="History">
                <q-menu>
                  <server-history></server-history>
                </q-menu>
              </q-btn>
            </div>
          </q-form>
        </template>

        <q-banner v-if="message || store.error" rounded dense class="login-error" role="alert">
          <template #avatar><q-icon name="sym_s_error" color="negative" /></template>
          {{ message || store.error }}
        </q-banner>

        <div v-if="apiKeyLoginEnabled" class="login-switch">
          <q-btn
            flat
            no-caps
            dense
            color="grey-7"
            :label="tab === 'pia' ? 'Use an API key instead' : 'Back to Printo sign-in'"
            @click="switchMode"
          />
        </div>
      </div>
    </main>

    <q-dialog v-model="pickerOpen" persistent>
      <q-card class="login-picker">
        <q-card-section>
          <div class="text-h6">Choose your account</div>
          <div class="text-caption text-grey">
            Several accounts use this Google login. Confirm with that account's password.
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="pickedEmployeeId"
            outlined
            emit-value
            map-options
            :options="pickerOptions"
            label="Account"
          />
          <q-input v-model="pickerPassword" outlined type="password" label="Password" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" no-caps @click="closePicker" />
          <q-btn
            unelevated
            color="primary"
            label="Sign in"
            no-caps
            :loading="loading"
            :disable="!pickedEmployeeId || !pickerPassword"
            @click="confirmPickedAccount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import ServerHistory from 'components/ServerHistory.vue';
import printoLogo from 'assets/printo-logo.png';
import { gatewayNodeConfig, useNodeStore } from 'src/stores/node';
import { piaLoginWithGoogle, piaLoginWithPassword, piaSelectGoogleAccount } from 'src/shared/pia';
import type { PiaGoogleAccount, PiaLoginResult } from 'src/shared/pia';
import { computed, nextTick, onMounted, ref, watch } from 'vue';

// Google Identity Services, loaded by the script tag in index.html
interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

const store = useNodeStore();

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const apiKeyLoginEnabled = process.env.ENABLE_API_KEY_LOGIN !== 'false';

const tab = ref<'pia' | 'apikey'>('pia');
const employeeId = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const message = ref('');

const googleButton = ref<HTMLElement | null>(null);
const googleReady = ref(false);
const pickerOpen = ref(false);
const pickerAccounts = ref<PiaGoogleAccount[]>([]);
const pickerIdToken = ref('');
const pickedEmployeeId = ref('');
const pickerPassword = ref('');

const pickerOptions = computed(() =>
  pickerAccounts.value.map((account) => ({
    value: account.employee_id,
    label: account.full_name
      ? `${account.full_name} (${account.employee_id})`
      : account.employee_id,
  })),
);

const state = ref({
  apiKey: '',
  // same server the PIA sign-in uses; localhost:9000/v1 (the dev proxy) when developing
  node: gatewayNodeConfig(),
  protocolOptions: ['http', 'https'],
});

onMounted(() => {
  void store.connectionCheck();
  if (googleClientId) waitForGoogle();
});

// The button container only exists while the PIA tab is shown, so draw it whenever it appears.
watch([googleReady, googleButton], async () => {
  if (!googleReady.value || !googleButton.value) return;
  await nextTick();
  const google = (window as unknown as { google: GoogleIdentity }).google;
  google.accounts.id.renderButton(googleButton.value, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: Math.min(356, googleButton.value.clientWidth || 356),
  });
});

function waitForGoogle(attempt = 0) {
  const google = (window as unknown as { google?: GoogleIdentity }).google;
  if (google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => void signInWithGoogle(response.credential),
    });
    googleReady.value = true;
  } else if (attempt < 50) {
    // the GIS script is async; give it up to ~10s
    window.setTimeout(() => waitForGoogle(attempt + 1), 200);
  } else {
    message.value = 'Google sign-in could not be loaded. Use your employee ID instead.';
  }
}

async function finish(result: PiaLoginResult, idToken = '') {
  if (result.status === 'ok') {
    closePicker();
    await store.piaLogin(result.session);
  } else if (result.status === 'select') {
    pickerAccounts.value = result.accounts;
    pickerIdToken.value = idToken;
    pickedEmployeeId.value = result.accounts[0]?.employee_id ?? '';
    pickerPassword.value = '';
    pickerOpen.value = true;
  } else {
    message.value = result.message;
  }
}

async function run(action: () => Promise<PiaLoginResult>, idToken = '') {
  loading.value = true;
  message.value = '';
  store.setError(null);
  try {
    await finish(await action(), idToken);
  } catch {
    message.value = 'Cannot reach PIA. Check your connection and try again.';
  } finally {
    loading.value = false;
  }
}

function signInWithPassword() {
  return run(() => piaLoginWithPassword(employeeId.value.trim(), password.value));
}

function signInWithGoogle(idToken?: string) {
  if (!idToken) {
    message.value = 'Google sign-in did not complete. Please try again.';
    return;
  }
  return run(() => piaLoginWithGoogle(idToken), idToken);
}

function confirmPickedAccount() {
  return run(
    () => piaSelectGoogleAccount(pickerIdToken.value, pickedEmployeeId.value, pickerPassword.value),
    pickerIdToken.value,
  );
}

function closePicker() {
  pickerOpen.value = false;
  pickerPassword.value = '';
  pickerIdToken.value = '';
}

function switchMode() {
  message.value = '';
  store.setError(null);
  tab.value = tab.value === 'pia' ? 'apikey' : 'pia';
}

function loginWithApiKey() {
  message.value = '';
  void store.login({
    apiKey: state.value.apiKey,
    node: state.value.node,
  });
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  display: flex;
  background: #f4f5f9;
}

.login-hero {
  flex: 0 0 44%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: #fff;
  background:
    radial-gradient(circle at 20% 15%, rgba(230, 158, 59, 0.22), transparent 45%),
    linear-gradient(145deg, #1f2937 0%, #31316a 100%);
}

.login-hero__inner {
  max-width: 420px;
}

.login-hero__title {
  margin: 24px 0 12px;
  font-size: 36px;
  line-height: 1.15;
  font-weight: 700;
}

.login-hero__lead {
  margin: 0 0 32px;
  font-size: 16px;
  line-height: 1.55;
  opacity: 0.8;
}

.login-hero__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 14px;

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 15px;
    opacity: 0.92;
  }
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 16px;

  &--card {
    margin-bottom: 20px;
  }
}

.brand-row__divider {
  width: 1px;
  height: 32px;
  background: rgba(128, 128, 128, 0.4);
}

// the logo is purple/orange, so it sits on a white badge to stay readable on dark backgrounds
.logo-badge {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);

  img {
    display: block;
    height: 32px;
    width: auto;
  }

  &--small {
    padding: 6px 10px;

    img {
      height: 26px;
    }
  }
}

.brand-tile {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(135deg, #e69e3b, #f2b45f);
  box-shadow: 0 8px 24px rgba(230, 158, 59, 0.35);

  &--small {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    font-size: 24px;
  }
}

.login-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 36px 32px 28px;
  border-radius: 20px;
  background: #fff;
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 0.06),
    0 12px 40px rgba(16, 24, 40, 0.1);
}

.login-card__title {
  margin: 0 0 6px;
  font-size: 26px;
  line-height: 1.2;
  font-weight: 700;
}

.login-card__sub {
  margin: 0 0 24px;
  font-size: 14px;
  color: #6b7280;
}

.google-slot {
  display: flex;
  justify-content: center;
  min-height: 44px;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  font-size: 12px;
  color: #9ca3af;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(128, 128, 128, 0.25);
  }
}

.login-form {
  display: grid;
  gap: 16px;
}

.login-field :deep(.q-field__control) {
  border-radius: 10px;
}

.login-btn {
  height: 46px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
}

.login-hint {
  margin: -8px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

.login-error {
  margin-top: 16px;
  background: rgba(225, 29, 72, 0.08);
  color: #be123c;
}

.login-switch {
  margin-top: 20px;
  text-align: center;
}

.login-picker {
  min-width: 320px;
  border-radius: 16px;
}

.body--dark {
  .login-page {
    background: #0b1220;
  }

  .login-card {
    background: #151e2e;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }

  .login-card__sub {
    color: #9ca3af;
  }

  .login-error {
    color: #fda4af;
  }
}

@media (max-width: 1023px) {
  .brand-row--card {
    justify-content: center;
  }

  .login-card__title,
  .login-card__sub,
  .login-hint {
    text-align: center;
  }

  .login-page {
    background: #fff;
  }

  .body--dark .login-page {
    background: #0b1220;
  }

  .login-card {
    box-shadow: none;
    padding: 24px 8px;
  }
}
</style>
