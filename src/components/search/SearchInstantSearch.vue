<template>
  <ais-instant-search
    v-if="searchClient && currentCollection"
    :search-client="searchClient"
    :index-name="currentCollection.name"
    :middlewares="middlewares"
  >
    <ais-configure :hits-per-page.camel="12" />
    <div class="row items-center q-col-gutter-sm no-wrap-md search-controls">
      <div class="col-12 col-md">
        <ais-search-box v-slot="{ currentRefinement, refine }">
          <debounced-search-box :model-value="currentRefinement" @refine="refine" />
        </ais-search-box>
      </div>
      <div class="col-auto">
        <q-input
          v-model.number="maxCandidates"
          label="Max candidates"
          title="Number of similar words for prefix and typo searching"
          type="number"
          outlined
          dense
          style="width: 140px"
          :min="0"
          :max="10000"
          @update:model-value="updateTypesenseAdapterConfiguration()"
        ></q-input>
      </div>
      <div class="col-auto row items-center no-wrap">
        <span class="text-subtitle2 q-mr-xs">Sort by</span>
        <ais-sort-by :items="sortBy" />
      </div>
      <div class="col-auto">
        <q-select
          v-model="currentStopwordsSet"
          :disable="!store.data.features.stopwords"
          label="Stopwords"
          outlined
          clearable
          dense
          options-dense
          style="min-width: 160px"
          :options="stopwords"
          @update:model-value="updateTypesenseAdapterConfiguration()"
        ></q-select>
      </div>
    </div>
    <div class="row items-center q-col-gutter-sm q-mt-none search-controls">
      <div class="col-auto">
        <ais-stats></ais-stats>
      </div>
      <q-space />
      <div v-if="hasFacets" class="col-auto">
        <ais-current-refinements v-slot="{ items }">
          <q-btn
            outline
            no-caps
            color="primary"
            icon="filter_list"
            label="Filters"
            :icon-right="filtersOpen ? 'expand_less' : 'expand_more'"
            @click="filtersOpen = !filtersOpen"
          >
            <q-badge v-if="refinementCount(items)" color="accent" floating>
              {{ refinementCount(items) }}
            </q-badge>
          </q-btn>
        </ais-current-refinements>
      </div>
      <div class="col-auto">
        <ais-hits-per-page
          :items="[
            { label: '12 hits per page', value: 12, default: true },
            { label: '48 hits per page', value: 48 },
            { label: '100 hits per page', value: 100 },
            { label: '250 hits per page', value: 250 },
          ]"
        />
      </div>
      <div class="col-auto">
        <export-button @export="exportPage" />
      </div>
    </div>
    <ais-current-refinements />

    <!-- v-show, not v-if: hiding the panel must not unmount the widgets, or their filters reset -->
    <q-card v-show="filtersOpen" flat bordered class="q-mt-sm q-pa-md filters-panel">
      <div class="row q-col-gutter-md">
        <div v-for="name in facetNumberFields" :key="name" class="col-12 col-sm-6 col-md-4">
          <div class="text-subtitle2">{{ name }}</div>
          <ais-range-input :searchable="true" :attribute="name" />
        </div>

        <div v-for="name in facetStringFields" :key="name" class="col-12 col-sm-6 col-md-4">
          <div class="text-subtitle2">{{ name }}</div>
          <ais-refinement-list :searchable="true" :attribute="name" />
        </div>

        <div v-for="name in facetBooleanFields" :key="name" class="col-12 col-sm-6 col-md-4">
          <div class="text-subtitle2">{{ name }}</div>
          <ais-refinement-list :attribute="name" />
        </div>
      </div>
    </q-card>

    <div class="q-mt-md">
      <ais-pagination class="q-mb-md" />
      <ais-hits>
        <template v-if="currentCollection" #item="{ item }">
          <search-result-item
            :item="item"
            @deleted="instantSearchInstance.refresh()"
          ></search-result-item>
        </template>
      </ais-hits>
      <ais-pagination class="q-my-md" />
    </div>
  </ais-instant-search>
  <div v-else-if="searchClientError">
    <q-banner inline-actions class="text-white bg-red">
      {{ searchClientError }}
    </q-banner>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useNodeStore } from '@/stores/node';
import SearchResultItem from '@/components/search/SearchResultItem.vue';
import DebouncedSearchBox from '@/components/search/DebouncedSearchBox.vue';
import ExportButton from '@/components/search/ExportButton.vue';
import type { ExportFormat } from '@/components/search/ExportButton.vue';
import TypesenseInstantSearchAdapter from 'typesense-instantsearch-adapter';
import type { CollectionSchema } from 'typesense/lib/Typesense/Collection';
import type { ConfigurationOptions } from 'typesense/lib/Typesense/Configuration';

const store = useNodeStore();
const searchClient = ref<any>(null);
const typesenseInstantsearchAdapter = ref<TypesenseInstantSearchAdapter>();
const instantSearchInstance = ref<any>();
const searchClientError = ref<string | null>(null);
const currentStopwordsSet = ref(null);
const maxCandidates = ref(4);
const filtersOpen = ref(false);

const middlewares = [
  ({ instantSearchInstance: instance }: any) => {
    return {
      subscribe() {
        instantSearchInstance.value = instance;
      },
      unsubscribe() {
        instantSearchInstance.value = null;
      },
    };
  },
];

const currentCollection = computed((): CollectionSchema | null => {
  return store.currentCollection;
});

const facetNumberFields = computed((): string[] => {
  if (!currentCollection.value || !currentCollection.value.fields) return [];
  return currentCollection.value.fields
    .filter(
      (f) =>
        f.facet &&
        ['int32', 'int64', 'float', 'int32[]', 'int64[]', 'float[]'].includes(f.type) &&
        !f.name.includes('.*'),
    )
    .map((f) => f.name);
});

const facetStringFields = computed((): string[] => {
  if (!currentCollection.value || !currentCollection.value.fields) return [];
  return currentCollection.value.fields
    .filter((f) => f.facet && ['string', 'string[]'].includes(f.type) && !f.name.includes('.*'))
    .map((f) => f.name);
});

const facetBooleanFields = computed((): string[] => {
  if (!currentCollection.value || !currentCollection.value.fields) return [];
  return currentCollection.value.fields
    .filter((f) => f.facet && ['bool', 'bool[]'].includes(f.type) && !f.name.includes('.*'))
    .map((f) => f.name);
});

const hasFacets = computed(
  () =>
    facetNumberFields.value.length > 0 ||
    facetStringFields.value.length > 0 ||
    facetBooleanFields.value.length > 0,
);

const refinementCount = (items: { refinements: unknown[] }[]) =>
  items.reduce((total, item) => total + item.refinements.length, 0);

const sortBy = computed((): { value: string; label: string }[] => {
  if (!currentCollection.value || !currentCollection.value.fields) return [];
  const sortBy = [{ value: currentCollection.value.name, label: 'Default' }];
  currentCollection.value.fields
    .filter((f) => ['int32', 'float'].includes(f.type) || (f.type === 'string' && f.sort))
    .forEach((f) => {
      if (!currentCollection.value) return;
      sortBy.push({
        value: `${currentCollection.value.name}/sort/${f.name}:asc`,
        label: `${f.name} asc`,
      });
      sortBy.push({
        value: `${currentCollection.value.name}/sort/${f.name}:desc`,
        label: `${f.name} desc`,
      });
    });
  return sortBy;
});

const stopwords = computed(() => {
  return store.data.stopwords.map((set) => set.id);
});

const exportPage = (format: ExportFormat) => {
  if (instantSearchInstance.value && currentCollection.value) {
    store.exportRows(
      instantSearchInstance.value.renderState[currentCollection.value.name].hits.results.hits,
      format,
    );
  }
};

const updateTypesenseAdapterConfiguration = () => {
  if (typesenseInstantsearchAdapter.value && currentCollection.value) {
    typesenseInstantsearchAdapter.value.updateConfiguration({
      // @ts-expect-error internal property
      ...typesenseInstantsearchAdapter.value.configuration,
      additionalSearchParameters: {
        // @ts-expect-error internal property
        ...typesenseInstantsearchAdapter.value.configuration.additionalSearchParameters,
        stopwords: currentStopwordsSet.value,
        max_candidates: maxCandidates.value,
      },
    });
  }
};

watch(
  // a refreshed PIA token must reach the search client too
  () => [currentCollection.value, store.piaSession?.access],
  () => {
    searchClient.value = null;
    searchClientError.value = null;

    window.setTimeout(() => {
      if (!store.loginData || !currentCollection.value) return;
      const query_by = (currentCollection.value?.fields || [])
        .filter((f) => f.index && ['string', 'string[]'].includes(f.type) && !f.name.includes('.*'))
        .map((f) => f.name)
        .join(',');

      try {
        const serverConfig: ConfigurationOptions = {
          nodes: [{ ...store.loginData.node }],
          apiKey: store.loginData.apiKey,
          // PIA sign-in: the gateway picks the Typesense key from this token. The key has to
          // travel as a header (the search client defaults to a URL parameter) so the gateway
          // can replace it.
          ...(store.piaSession
            ? {
                sendApiKeyAsQueryParam: false,
                additionalHeaders: { Authorization: `Bearer ${store.piaSession.access}` },
              }
            : {}),
        };
        if (store.loginData.connectionTimeoutSeconds !== undefined) {
          serverConfig.connectionTimeoutSeconds = store.loginData.connectionTimeoutSeconds;
        }
        const adapter = new TypesenseInstantSearchAdapter({
          server: serverConfig,
          additionalSearchParameters: {
            max_candidates: maxCandidates.value,
            query_by,
          },
        });
        typesenseInstantsearchAdapter.value = adapter;
        searchClient.value = adapter.searchClient;
      } catch (error) {
        searchClientError.value = (error as Error).message + 'Using query_by: ' + query_by;
        console.error(error);
      }
    });
  },
  { immediate: true },
);
</script>

<style>
.body--dark .ais-SearchBox-input,
.body--dark .ais-MenuSelect-select,
.body--dark .ais-NumericSelector-select,
.body--dark .ais-HitsPerPage-select,
.body--dark .ais-ResultsPerPage-select,
.body--dark .ais-SortBy-select {
  background-color: rgba(255, 255, 255, 0.07);
  color: #fff;
}

.body--dark .ais-InstantSearch option {
  background-color: #1f2937;
  color: #fff;
}

/* one height for every control so the two rows line up */
.search-controls .ais-SortBy-select,
.search-controls .ais-HitsPerPage-select {
  box-sizing: border-box;
  height: 40px;
}

.search-controls .q-btn,
.search-controls .q-btn-dropdown .q-btn {
  height: 40px;
}

.search-controls .ais-CurrentRefinements {
  margin: 0;
}

.filters-panel {
  max-height: 50vh;
  overflow-y: auto;
}

.ais-InfiniteHits-item,
.ais-InfiniteResults-item,
.ais-Hits-item,
.ais-Results-item {
  box-shadow: none;
}
</style>
