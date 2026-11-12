<template>
  <q-page-container>
    <q-page padding>
      <div class="translation-review">
        <div class="row items-center justify-between review-header">
          <div class="text-subtitle1 text-weight-medium">
            {{ selectedLanguageLabel }} translation review
          </div>
          <q-btn
            flat
            round
            dense
            color="primary"
            icon="download"
            :aria-label="`Download ${selectedLocale} index.json`"
            @click="downloadTranslations"
          >
            <q-tooltip>Download {{ selectedLocale }} index.json</q-tooltip>
          </q-btn>
        </div>
  
        <div class="review-columns">
          <section class="editor-column">
            <q-banner rounded class="bg-blue-1 q-mb-md">
              Drafts are saved in this browser and applied live in the app.
              Download {{ selectedLocale }}-index.json and copy it to
              <code>src/i18n/{{ selectedLocale }}/index.json</code> when you are done.
            </q-banner>

            <div class="text-caption text-grey-7 q-mb-xs">
              {{ currentIndex + 1 }} / {{ filteredKeys.length }} keys · {{ editedCount }} edited
            </div>
            <q-select
              v-model="selectedLocale"
              :options="languageOptions"
              emit-value
              map-options
              dense
              outlined
              options-dense
              label="Language"
              class="q-mb-sm"
            />
            <q-input
              v-model="search"
              clearable
              dense
              outlined
              label="Find a key or text"
              class="q-mb-sm"
            />
            <q-select
              v-model="activeKey"
              :options="filteredKeys"
              dense
              outlined
              options-dense
              label="Translation key"
              class="q-mb-md"
            />

            <q-card v-if="activeKey" flat bordered>
              <q-card-section class="bg-grey-2">
                <div class="text-overline">{{ activeKey }}</div>
                <div class="text-subtitle1 q-mt-sm">{{ sourceText }}</div>
              </q-card-section>

              <q-card-section>
                <q-input
                  :model-value="translationText"
                  type="textarea"
                  autogrow
                  outlined
                  label="Translation"
                  @update:model-value="updateTranslation"
                />
              </q-card-section>

              <q-card-actions align="between">
                <q-btn
                  flat
                  icon="arrow_back"
                  label="Previous"
                  :disable="currentIndex <= 0"
                  @click="selectOffset(-1)"
                />
                <q-btn
                  flat
                  icon-right="arrow_forward"
                  label="Next"
                  :disable="currentIndex < 0 || currentIndex >= filteredKeys.length - 1"
                  @click="selectOffset(1)"
                />
              </q-card-actions>
            </q-card>

            <q-banner v-else rounded class="bg-grey-2">
              No translation keys match your search.
            </q-banner>

            <div class="column items-end q-mt-md">
              <q-btn
                flat
                color="negative"
                label="Discard browser draft"
                :disable="editedCount === 0"
                @click="showDiscardDialog = true"
              />
            </div>
          </section>

          <section class="context-column">
            <q-card v-if="activeKey" flat bordered class="context-card">
              <q-card-section class="row items-center justify-between context-header">
                <div class="text-subtitle2">Live app preview</div>
                <div class="row items-center q-gutter-xs">
                  <span class="text-caption text-grey-7">
                    {{ contextMatchCount }} matches
                  </span>
                  <q-btn
                    flat
                    round
                    dense
                    size="sm"
                    icon="refresh"
                    aria-label="Reload app context"
                    @click="reloadContext"
                  />
                </div>
              </q-card-section>

              <q-expansion-item
                dense
                dense-toggle
                expand-separator
                :label="`Used in ${activeUsages.length} source locations`"
                header-class="usage-header"
              >
                <q-card-section class="usage-list">
                  <div v-if="activeUsages.length" class="row q-gutter-xs">
                    <q-chip v-for="usage in activeUsages" :key="usage" dense square>
                      {{ usage }}
                    </q-chip>
                  </div>
                  <div v-else class="text-caption text-grey-7">
                    No static component usage found. This key may be used dynamically or only in an
                    optional feature.
                  </div>
                </q-card-section>
              </q-expansion-item>

              <q-card-section class="context-body">
                <div class="text-caption context-status q-px-sm q-py-xs">
                  {{ contextMatchCount
                    ? "Matching text is outlined in orange."
                    : "No match on this screen. Navigate the app to a usage of this key." }}
                </div>
                <div v-if="contextReady" class="app-context-frame">
                  <iframe
                    :key="contextVersion"
                    ref="contextFrame"
                    src="/?translationReview=1"
                    title="Komunitin app translation context"
                    @load="onContextLoad"
                  />
                </div>
                <q-skeleton v-else height="60vh" />
              </q-card-section>
            </q-card>
          </section>
        </div>
      </div>
  
      <q-dialog v-model="showDiscardDialog">
        <q-card>
          <q-card-section class="text-h6">Discard translation draft?</q-card-section>
          <q-card-section>
            This removes all saved browser edits. It does not change the translation file.
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat label="Cancel" />
            <q-btn v-close-popup flat color="negative" label="Discard" @click="discardDraft" />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useQuasar } from "quasar";
import enMessages from "@/i18n/en-us/index.json";
import { i18n, setLocale } from "@/boot/i18n";
import langs, { type LangName, translationReviewDraftKey } from "@/i18n";

const keys = Object.keys(enMessages) as Array<keyof typeof enMessages>;
const localeFiles = import.meta.glob<Record<string, string>>(
  "/src/i18n/*/index.json",
  { eager: true, import: "default" }
);
const messagesByLocale = Object.fromEntries(
  Object.entries(localeFiles).map(([path, messages]) => [
    path.match(/\/i18n\/([^/]+)\/index\.json$/)?.[1] ?? "",
    messages
  ])
) as Record<string, Record<string, string>>;
const languageOptions = Object.keys(messagesByLocale)
  .filter(locale =>
    locale in langs &&
    langs[locale as LangName].loadMessages !== undefined
  )
  .map(locale => ({
    label: langs[locale as LangName].label,
    value: locale
  }));
const defaultLocale = languageOptions.find(option => option.value === "nl")?.value
  ?? languageOptions.find(option => option.value === "en-us")?.value
  ?? languageOptions[0]?.value
  ?? "en-us";
const sourceFiles = import.meta.glob<string>(
  [
    "/src/**/*.vue",
    "/src/**/*.ts",
    "!/src/**/__tests__/**",
    "!/src/**/*.spec.ts",
    "!/src/**/*.test.ts",
    "!/src/test/**"
  ],
  { query: "?raw", import: "default", eager: true }
);
const usagesByKey = Object.fromEntries(keys.map(key => [key, new Set<string>()]));
for (const [file, source] of Object.entries(sourceFiles)) {
  if (file.includes("/__tests__/") || file.includes("/test/")) {
    continue;
  }
  for (const match of source.matchAll(/(?:\$t|\bt)\s*\(\s*(['"])([^'"]+)\1/g)) {
    const key = match[2] as keyof typeof enMessages;
    if (key in usagesByKey) {
      const sourcePath = file.replace(/^.*\/src\//, "src/");
      const line = source.slice(0, match.index).split("\n").length;
      usagesByKey[key].add(`${sourcePath}:${line}`);
    }
  }
}

const search = ref("");
const selectedLocale = ref(defaultLocale);
const activeKey = ref<keyof typeof enMessages | null>(keys[0] ?? null);
const draft = ref<Record<string, string>>({});
const showDiscardDialog = ref(false);
const contextReady = ref(false);
const contextVersion = ref(0);
const contextFrame = ref<HTMLIFrameElement>();
const contextMatchCount = ref(0);
const $q = useQuasar();
let contextObserver: MutationObserver | undefined;

const activeMessages = computed(() => messagesByLocale[selectedLocale.value] ?? {});
const selectedLanguageLabel = computed(() =>
  languageOptions.find(option => option.value === selectedLocale.value)?.label ?? selectedLocale.value
);

function loadDraft(locale: string) {
  draft.value = {};
  try {
    const saved = localStorage.getItem(translationReviewDraftKey(locale));
    if (saved === null) {
      return;
    }

    const parsed: unknown = JSON.parse(saved);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("The saved translation draft is not an object.");
    }

    const validEntries = Object.entries(parsed).filter(
      ([key, value]) =>
        keys.includes(key as keyof typeof enMessages) &&
        typeof value === "string" &&
        value !== messagesByLocale[locale]?.[key]
    );
    draft.value = Object.fromEntries(validEntries);
  } catch (error) {
    console.error(`Could not load the saved ${locale} translation draft.`, error);
    $q.notify({
      type: "negative",
      message: "Could not load the saved translation draft. Discard it and try again."
    });
  }
}

loadDraft(selectedLocale.value);

const filteredKeys = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return keys.filter(key => {
    const translation = draft.value[key] ?? activeMessages.value[key] ?? "";
    return !query || [key, enMessages[key], translation].some(
      value => value.toLocaleLowerCase().includes(query)
    );
  });
});

watch(filteredKeys, availableKeys => {
  if (activeKey.value && !availableKeys.includes(activeKey.value)) {
    activeKey.value = availableKeys[0] ?? null;
  }
});

watch(selectedLocale, async locale => {
  loadDraft(locale);
  try {
    await setLocale(locale);
    i18n.global.setLocaleMessage(locale, {
      ...i18n.global.getLocaleMessage(locale),
      ...enMessages,
      ...messagesByLocale[locale],
      ...draft.value
    });
  } catch (error) {
    console.error(`Could not switch the translation review to ${locale}.`, error);
    $q.notify({
      type: "negative",
      message: `Could not load the ${locale} language.`
    });
  }
});

const currentIndex = computed(() =>
  activeKey.value ? filteredKeys.value.indexOf(activeKey.value) : -1
);
const sourceText = computed(() => activeKey.value ? enMessages[activeKey.value] : "");
const translationText = computed(() => {
  if (!activeKey.value) {
    return "";
  }
  return draft.value[activeKey.value] ?? activeMessages.value[activeKey.value] ?? "";
});
const editedCount = computed(() => Object.keys(draft.value).length);
const activeUsages = computed(() =>
  activeKey.value ? [...usagesByKey[activeKey.value]] : []
);

function persistDraft() {
  try {
    localStorage.setItem(translationReviewDraftKey(selectedLocale.value), JSON.stringify(draft.value));
  } catch (error) {
    console.error(`Could not save the ${selectedLocale.value} translation draft.`, error);
    $q.notify({
      type: "negative",
      message: "Could not save the draft in this browser. Download your changes to keep them."
    });
  }
}

function updateTranslation(value: string | number | null) {
  if (!activeKey.value || typeof value !== "string") {
    return;
  }

  if (value === activeMessages.value[activeKey.value]) {
    delete draft.value[activeKey.value];
  } else {
    draft.value[activeKey.value] = value;
  }
  draft.value = { ...draft.value };
  i18n.global.mergeLocaleMessage(selectedLocale.value, { [activeKey.value]: value });
  persistDraft();
}

function selectOffset(offset: number) {
  const nextIndex = currentIndex.value + offset;
  activeKey.value = filteredKeys.value[nextIndex] ?? null;
}

function downloadTranslations() {
  const updatedMessages = { ...activeMessages.value, ...draft.value };
  const blob = new Blob([`${JSON.stringify(updatedMessages, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selectedLocale.value}-index.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function translationMatcher(value: string) {
  const phrase = value.trim().replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  ).replace(/\\\{[^}]+\\\}/g, ".+?").replace(/\s+/g, "\\s+");
  return new RegExp(`^${phrase}$`, "i");
}

function highlightTranslationInContext() {
  const doc = contextFrame.value?.contentDocument;
  if (!doc?.body) {
    contextMatchCount.value = 0;
    return;
  }

  doc.querySelectorAll("[data-translation-review-match]").forEach(element =>
    element.removeAttribute("data-translation-review-match")
  );
  const phrases = translationText.value
    .split("|")
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => translationMatcher(value));
  const matches = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    return phrases.some(pattern => pattern.test(normalized));
  };
  const textOf = (element: Element) =>
    (element as HTMLElement).innerText ?? element.textContent ?? "";
  const elements = [...doc.body.querySelectorAll<HTMLElement>("*")];
  const targets = elements.filter(element => {
    if (element.getClientRects().length === 0) {
      return false;
    }
    const textMatches = matches(textOf(element))
      && ![...element.children].some(child => matches(textOf(child)));
    const attributeMatches = ["aria-label", "placeholder", "title"].some(attribute => {
      const value = element.getAttribute(attribute);
      return value !== null && matches(value);
    });
    return textMatches || attributeMatches;
  });

  targets.forEach(element => element.setAttribute("data-translation-review-match", ""));
  contextMatchCount.value = targets.length;
}

function onContextLoad() {
  contextObserver?.disconnect();
  const doc = contextFrame.value?.contentDocument;
  if (!doc?.body) {
    return;
  }

  if (!doc.querySelector("#translation-review-highlight-style")) {
    const style = doc.createElement("style");
    style.id = "translation-review-highlight-style";
    style.textContent = `
      #container.with-drawer {
        width: 100% !important;
        height: 100% !important;
        margin-top: 0 !important;
      }
      .q-drawer,
      .q-footer.lt-md {
        display: none !important;
      }
      .q-page-container {
        padding-left: 0 !important;
      }
      [data-translation-review-match] {
        outline: 3px solid #e65100 !important;
        outline-offset: 3px !important;
        border-radius: 2px;
      }
    `;
    doc.head.append(style);
  }

  contextObserver = new MutationObserver(highlightTranslationInContext);
  contextObserver.observe(doc.body, { childList: true, characterData: true, subtree: true });
  highlightTranslationInContext();
}

function reloadContext() {
  contextObserver?.disconnect();
  contextObserver = undefined;
  contextMatchCount.value = 0;
  contextVersion.value += 1;
}

watch([activeKey, translationText], async () => {
  await nextTick();
  highlightTranslationInContext();
});

onMounted(async () => {
  await setLocale(selectedLocale.value);
  i18n.global.setLocaleMessage(selectedLocale.value, {
    ...i18n.global.getLocaleMessage(selectedLocale.value),
    ...enMessages,
    ...activeMessages.value,
    ...draft.value
  });
  contextReady.value = true;
});

onBeforeUnmount(() => contextObserver?.disconnect());

function discardDraft() {
  draft.value = {};
  activeKey.value = keys[0] ?? null;
  i18n.global.setLocaleMessage(selectedLocale.value, {
    ...enMessages,
    ...activeMessages.value
  });
  try {
    localStorage.removeItem(translationReviewDraftKey(selectedLocale.value));
  } catch (error) {
    console.error(`Could not discard the saved ${selectedLocale.value} translation draft.`, error);
    $q.notify({
      type: "negative",
      message: "Could not remove the saved browser draft."
    });
  }
}
</script>

<style scoped>
.translation-review {
  width: 100%;
}

.review-header {
  min-height: 36px;
  margin-bottom: 4px;
}

.review-columns {
  display: grid;
  grid-template-columns: minmax(260px, 24%) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.editor-column {
  min-width: 0;
}

.context-column {
  min-width: 0;
}

.context-card {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 76px);
  min-height: 300px;
}

.context-header {
  min-height: 40px;
  padding: 4px 12px;
}

.usage-header {
  min-height: 32px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 12px;
}

.usage-list {
  padding: 4px 12px 8px;
}

.context-status {
  flex: 0 0 auto;
  color: #616161;
}

.context-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 4px 8px 8px;
}

.app-context-frame {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 4px;
}

iframe {
  width: 100%;
  height: 100%;
  border: 0;
}

@media (max-width: 900px) {
  .review-columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .context-card {
    height: calc(75dvh - 48px);
    min-height: 480px;
  }
}

@media (max-height: 700px) and (min-width: 901px) {
  .context-header {
    min-height: 32px;
    padding-top: 0;
    padding-bottom: 0;
  }
}
</style>
