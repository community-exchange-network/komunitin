<template>
  <q-drawer
    v-model="open"
    side="right"
    overlay
    behavior="mobile"
    :width="drawerWidth"
  >
    <div class="column full-height advanced-filters-content">
      <div class="row items-center q-pa-md">
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('cancel')"
          @click="open = false"
        />
        <div class="text-h6 q-ml-sm">
          {{ $t('filters') }}
        </div>
      </div>

      <div class="col scroll q-px-md">
        <div class="text-subtitle2 text-onsurface-m q-mb-sm">
          {{ $t('category') }}
        </div>
        <q-list
          separator
          bordered
        >
          <q-item
            v-for="opt in categoryOptions"
            :key="opt.value ?? ''"
            v-ripple
            clickable
            :active="draftCategory === opt.value"
            active-class="bg-active text-onsurface text-weight-bold"
            @click="draftCategory = opt.value"
          >
            <q-item-section>{{ opt.label }}</q-item-section>
          </q-item>
        </q-list>

        <div class="text-subtitle2 text-onsurface-m q-mt-lg q-mb-sm">
          {{ $t('dateRange') }}
        </div>
        <q-input
          v-model="dateText"
          outlined
          clearable
          :label="$t('dateRange')"
          :placeholder="`${displayFormat} – ${displayFormat}`"
          :error="dateTextError"
          @blur="commitDateText"
          @keyup.enter="commitDateText"
          @clear="setDraftRange(null, null)"
        >
          <template #append>
            <q-icon
              name="event"
              class="cursor-pointer"
            >
              <q-popup-proxy
                cover
                @hide="pickerModel = toPickerModel(draftDateFrom, draftDateTo)"
              >
                <q-date
                  v-model="pickerModel"
                  range
                  :mask="pickerMask"
                  @range-start="onRangeStart"
                  @update:model-value="onPickerChange"
                >
                  <div class="row items-center justify-end">
                    <q-btn
                      v-close-popup
                      flat
                      color="primary"
                      :label="$t('close')"
                    />
                  </div>
                </q-date>
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>
      </div>

      <div class="row justify-end q-gutter-sm q-pa-md">
        <q-btn
          flat
          :label="$t('resetFilters')"
          @click="clearDraft"
        />
        <q-btn
          unelevated
          color="primary"
          :label="$t('applyFilters')"
          @click="applyFilters"
        />
      </div>
    </div>
  </q-drawer>
</template>
<script setup lang="ts">
/**
 * Right-side "advanced filters" panel opened from the home feed's header: category
 * and created-date range. Selections are staged locally and only committed (emitted)
 * when "Apply filters" is pressed, so closing, resetting or picking without applying
 * doesn't affect the feed. See issue #931 for the rest of the wireframe (type and
 * proximity), not implemented here since type already lives in the chip row and
 * proximity has no backend support yet.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useQuasar } from "quasar";
import { useStore } from "vuex";
import { format, isSameDay, isValid, parse } from "date-fns";
import { getDateLocale } from "../boot/i18n";
import type { Category } from "../store/model";

const props = defineProps<{
  /**
   * The group code, used to load the list of categories.
   */
  code: string,
  /**
   * Selected category id, or null if no category filter is applied.
   */
  category: string | null,
  /**
   * Selected creation-date range bounds, or null if not filtering on that bound.
   */
  dateFrom: Date | null,
  dateTo: Date | null
}>()

const emit = defineEmits<{
  (e: "update:category", value: string | null): void,
  (e: "update:dateFrom", value: Date | null): void,
  (e: "update:dateTo", value: Date | null): void
}>()

const open = defineModel<boolean>({ default: false })

const store = useStore()
const { t } = useI18n()
const $q = useQuasar()
// Full-width on small screens, so the panel covers the whole screen (including
// over the bottom nav bar) with no backdrop sliver left showing behind it.
const drawerWidth = computed(() => $q.screen.lt.sm ? $q.screen.width : 320)

watch(() => props.code, async (code) => {
  if (code) {
    await store.dispatch("categories/loadList", { group: code })
  }
}, { immediate: true })

const categories = computed<Category[]>(() => store.getters["categories/currentList"] ?? [])
const categoryOptions = computed(() => [
  { label: t('allCategories'), value: null as string | null },
  ...categories.value.map((c: Category) => ({ label: c.attributes.name, value: c.id }))
])

const draftCategory = ref<string | null>(props.category)
const draftDateFrom = ref<Date | null>(props.dateFrom)
const draftDateTo = ref<Date | null>(props.dateTo)

// Date range picker. A single selected day is stored as from == to, so the
// parent searches just that day; two days search the range between them.
type PickerModel = string | { from: string, to: string } | null
const pickerMask = "YYYY/MM/DD" // QDate format
const pickerFormat = "yyyy/MM/dd" // same format for date-fns
const locale = getDateLocale()
const displayFormat = locale?.formatLong?.date({ width: "short" }) ?? "MM/dd/yyyy"

const toPickerModel = (from: Date | null, to: Date | null): PickerModel => {
  if (!from || !to) return null
  return isSameDay(from, to)
    ? format(from, pickerFormat)
    : { from: format(from, pickerFormat), to: format(to, pickerFormat) }
}
const parsePickerDate = (value: string) => parse(value, pickerFormat, new Date())

const pickerModel = ref<PickerModel>(toPickerModel(props.dateFrom, props.dateTo))

const setDraftRange = (from: Date | null, to: Date | null) => {
  draftDateFrom.value = from
  draftDateTo.value = to
  pickerModel.value = toPickerModel(from, to)
  // Also replaces any uncommitted (possibly invalid) typed text.
  dateText.value = dateRangeLabel.value
}

// QDate only emits a model update once the range is completed with a second
// click, so the first click alone selects that single day.
const onRangeStart = ({ year, month, day }: { year: number, month: number, day: number }) => {
  const date = new Date(year, month - 1, day)
  draftDateFrom.value = date
  draftDateTo.value = date
}

const onPickerChange = (value: PickerModel) => {
  if (value === null) {
    setDraftRange(null, null)
  } else if (typeof value === "string") {
    const date = parsePickerDate(value)
    setDraftRange(date, date)
  } else {
    setDraftRange(parsePickerDate(value.from), parsePickerDate(value.to))
  }
}

const formatDate = (date: Date) => format(date, displayFormat, { locale })

const dateRangeLabel = computed(() => {
  const from = draftDateFrom.value
  const to = draftDateTo.value
  if (!from || !to) return ""
  return isSameDay(from, to) ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`
})

// Typed date: a single date, or two dates separated by a dash or "to".
const dateText = ref<string | null>(dateRangeLabel.value)
watch(dateRangeLabel, (label) => { dateText.value = label })

/**
 * @returns the [from, to] range, null if the text is empty, or undefined if it
 * isn't a valid date or range.
 */
const parseDateText = (text: string | null): [Date, Date] | null | undefined => {
  const trimmed = text?.trim()
  if (!trimmed) return null
  // The separator needs spaces around a plain hyphen, which some locales use within dates.
  const parts = trimmed.split(/\s*[–—]\s*|\s+-\s+|\s+to\s+/i)
  if (parts.length > 2) return undefined
  const dates = parts.map(part => parse(part, displayFormat, new Date(), { locale }))
  if (dates.some(date => !isValid(date))) return undefined
  const [from, to = from] = dates
  return from <= to ? [from, to] : [to, from]
}

const dateTextError = computed(() => parseDateText(dateText.value) === undefined)

/**
 * Commits the typed date range to the draft. Invalid text is kept in the field
 * for correction and not committed.
 * @returns whether the text was valid.
 */
const commitDateText = () => {
  const range = parseDateText(dateText.value)
  if (range === undefined) return false
  setDraftRange(...(range ?? [null, null]))
  return true
}

// Resync the draft with the last applied values, so a discarded edit (close
// without applying) doesn't leak into the next time the panel is opened.
const resetDraft = () => {
  draftCategory.value = props.category
  setDraftRange(props.dateFrom, props.dateTo)
}

// Watch the open state rather than the drawer's `show` event: the drawer
// re-emits `show` when the nested date picker popup closes, which would wipe
// the dates just picked.
watch(open, (isOpen) => {
  if (isOpen) resetDraft()
})

const clearDraft = () => {
  draftCategory.value = null
  setDraftRange(null, null)
}

const applyFilters = () => {
  // Pick up text typed without leaving the field; don't apply an invalid date.
  if (!commitDateText()) return
  emit("update:category", draftCategory.value)
  emit("update:dateFrom", draftDateFrom.value)
  emit("update:dateTo", draftDateTo.value)
  open.value = false
}

</script>
<style lang="scss" scoped>
// A crisp dark border (rather than Quasar's default barely-visible 12%-opacity
// grey) to clearly set the panel apart from the page behind it. QDrawer builds
// its own root class list in a manual render function rather than a compiled
// template, so a class passed to the component doesn't land on its DOM node —
// style our own content wrapper instead, which fills the drawer edge to edge.
.advanced-filters-content {
  border-left: 1px solid rgba(0, 0, 0, 0.87);
}
</style>
