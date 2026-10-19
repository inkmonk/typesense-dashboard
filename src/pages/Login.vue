<template>
  <div class="fullscreen row bg-primary text-center q-pa-md flex flex-center">
    <div class="col col-md-4" style="max-width: 440px">
      <div>
        <h5 class="text-h5 text-white q-my-md">Typesense Dashboard</h5>
      </div>
      <div>
        <q-card bordered class="q-pa-lg shadow-1">
          <q-tabs
            v-if="apiKeyLoginEnabled"
            v-model="tab"
            dense
            align="justify"
            active-color="primary"
            indicator-color="primary"
          >
            <q-tab name="pia" label="Printo sign-in" no-caps />
            <q-tab name="apikey" label="API key" no-caps />
          </q-tabs>
          <q-separator v-if="apiKeyLoginEnabled" />

          <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="pia" class="q-pa-none">
              <q-card-section>
                <q-form class="q-gutter-md" @submit.prevent="signInWithPassword">
                  <q-input
                    v-model="employeeId"
                    filled
                    label="Employee ID"
                    autocomplete="username"
                    :disable="loading"
                  />
                  <q-input
                    v-model="password"
                    filled
                    label="Password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="current-password"
                    :disable="loading"
                  >
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
                    color="primary"
                    size="lg"
                    class="full-width"
                    label="Sign in"
                    type="submit"
                    :loading="loading"
                    :disable="!employeeId || !password"
                  />
                </q-form>
              </q-card-section>
              <q-separator inset />
              <q-card-section>
                <div class="text-caption text-grey q-mb-sm">or</div>
                <!-- Google renders its official button into this element -->
                <div v-if="googleClientId" ref="googleButton" class="flex flex-center"></div>
                <p v-else class="text-caption text-grey">
                  Google sign-in is not configured for this build.
                </p>
              </q-card-section>
            </q-tab-panel>

            <q-tab-panel name="apikey" class="q-pa-none">
              <q-card-section>
                <q-form class="q-gutter-md">
                  <q-input v-model="state.apiKey" filled type="password" label="Api Key" />
                  <p v-if="$q.platform.is.electron">
                    requires server with cors enabled only for search function.
                  </p>
                  <p v-else>requires server with cors enabled.</p>
                  <q-select
                    v-model="state.node.protocol"
                    filled
                    :options="state.protocolOptions"
                    label="Protocol"
                  />
                  <q-input v-model="state.node.host" filled type="text" label="host" />
                  <q-input v-model.number="state.node.port" filled type="number" label="port" />
                  <q-input
                    v-model="state.node.path"
                    filled
                    type="text"
                    label="path"
                    hint="optional: leave blank or start with / and end without /"
                  />
                  <div class="text-left">
                    <q-toggle
                      v-if="$q.platform.is.electron && state.node.protocol === 'https'"
                      v-model="state.node.tls"
                      label="Check TLS"
                    />
                  </div>
                </q-form>
              </q-card-section>
              <q-card-actions class="q-px-md row">
                <q-btn
                  unelevated
                  color="primary"
                  size="lg"
                  style="flex: 1"
                  label="Login"
                  @click="loginWithApiKey()"
                />
                <q-btn color="primary" size="lg" icon="sym_s_history">
                  <q-menu>
                    <server-history></server-history>
                  </q-menu>
                </q-btn>
              </q-card-actions>
            </q-tab-panel>
          </q-tab-panels>

          <q-card-section v-if="message || store.error">
            <p class="text-red q-mb-none">{{ message || store.error }}</p>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="pickerOpen" persistent>
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">Choose your account</div>
          <div class="text-caption text-grey">
            Several accounts use this Google login. Confirm with that account's password.
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="pickedEmployeeId"
            filled
            emit-value
            map-options
            :options="pickerOptions"
            label="Account"
          />
          <q-input v-model="pickerPassword" filled type="password" label="Password" />
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
import { useNodeStore } from 'src/stores/node';
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
  node: {
    host: 'typesense.printo.in',
    port: 443,
    protocol: 'https',
    path: '/v1/',
    tls: true,
  },
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
    width: 320,
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

function loginWithApiKey() {
  message.value = '';
  void store.login({
    apiKey: state.value.apiKey,
    node: state.value.node,
  });
}
</script>
