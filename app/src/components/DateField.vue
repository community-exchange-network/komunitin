<template>
  <q-input
    v-model="draftDate"
    :error="hasInputError"
    name="date"
    :label="label"
    :hint="hint"
    :placeholder="localFormat"
    outlined
    required
    @blur="commitDraftDate"
    @keyup.enter="commitDraftDate"
  >
    <template #append>
      <q-icon 
        name="event" 
        class="cursor-pointer"
      >
        <q-popup-proxy
          cover
          transition-show="scale"
          transition-hide="scale"
        >
          <q-date
            v-model="pickerDate" 
            :mask="pickerMask"
          >
            <div class="row items-center justify-end">
              <q-btn 
                v-close-popup 
                :label="t('close')" 
                color="primary" 
                flat 
              />
            </div>
          </q-date>
        </q-popup-proxy>
      </q-icon>
    </template>
  </q-input>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { getDateLocale } from "../boot/i18n"
import { format, isValid, parse } from "date-fns"
import { useI18n } from "vue-i18n"
const props = defineProps<{
  modelValue: Date | null,
  label: string
  hint?: string
}>()
const emit = defineEmits<{
  (e: "update:modelValue", value: Date | null): void
}>()
const { t } = useI18n()
const locale = getDateLocale()
const pickerMask = "YYYY/MM/DD" // this is the format for QDate component
const pickerFormat = "yyyy/MM/dd" // this is the same format for date-fns
const localFormat = locale?.formatLong?.date({ width: "short" })

const formatLocalDate = (value: Date | null): string => value ? format(value, localFormat, { locale }) : ""

const parseLocalDate = (value: string): Date | null | undefined => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = parse(trimmed, localFormat, new Date(), { locale })
  return isValid(parsed) ? parsed : undefined
}

const syncFromModel = (value: Date | null) => {
  draftDate.value = formatLocalDate(value)
}

const draftDate = ref(formatLocalDate(props.modelValue))
const hasInputError = computed(() => parseLocalDate(draftDate.value) === undefined)

watch(() => props.modelValue, (value) => {
  syncFromModel(value)
})

const commitDraftDate = () => {
  const parsed = parseLocalDate(draftDate.value)
  if (parsed === undefined) {
    return
  }

  emit("update:modelValue", parsed)
  syncFromModel(parsed)
}

const pickerDate = computed({
  get: () => props.modelValue ? format(props.modelValue, pickerFormat, {locale}) : null,
  set: (value) => {
    const parsed = value ? parse(value, pickerFormat, new Date(), { locale }) : null
    emit("update:modelValue", parsed)
    syncFromModel(parsed)
  }
})

</script>