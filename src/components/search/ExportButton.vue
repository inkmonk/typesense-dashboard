<template>
  <q-btn-dropdown
    split
    unelevated
    outline
    color="primary"
    icon="download"
    :label="`Export ${format.toUpperCase()}`"
    :disable="disable"
    @click="emit('export', format)"
  >
    <q-list dense>
      <q-item
        v-for="option in formats"
        :key="option.value"
        v-close-popup
        clickable
        :active="option.value === format"
        @click="choose(option.value)"
      >
        <q-item-section>{{ option.label }}</q-item-section>
      </q-item>
    </q-list>
  </q-btn-dropdown>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { LocalStorage } from 'quasar';

export type ExportFormat = 'json' | 'csv';

defineProps<{ disable?: boolean }>();
const emit = defineEmits<{ export: [format: ExportFormat] }>();

const STORAGE_KEY_EXPORT_FORMAT = 'typesense-export-format';
const formats: { value: ExportFormat; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
];

// A menu pick exports in that format and becomes the default for the main button.
const stored = LocalStorage.getItem<ExportFormat>(STORAGE_KEY_EXPORT_FORMAT);
const format = ref<ExportFormat>(stored === 'csv' ? 'csv' : 'json');

const choose = (value: ExportFormat) => {
  format.value = value;
  LocalStorage.set(STORAGE_KEY_EXPORT_FORMAT, value);
  emit('export', value);
};
</script>
