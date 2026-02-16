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
    @clear="commitDraftDate"
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
            :options="optionsFn"
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
  options?: {
    min?: Date
    max?: Date
  }
}>()
const emit = defineEmits<{
  (e: "update:modelValue", value: Date | null): void
}>()
const { t } = useI18n()
const pickerMask = "YYYY/MM/DD" // this is the format for QDate component
const pickerFormat = "yyyy/MM/dd" // this is the same format for date-fns

// Locale must be defined at this point because it is set in the i18n boot file.
const locale = getDateLocale()
// Anyway we define a default format for formal type safety.
const localFormat = locale?.formatLong?.date({ width: "short" }) ?? "MM/dd/yyyy"

const formatLocalDate = (value: Date | null): string => {
  return (value && isValid(value)) 
    ? format(value, localFormat, { locale }) 
    : ""
}

/**
 * @param value the raw input string from the user. Note that it can be null if following a clear action.
 * @returns null if the input is empty, a Date if the input is valid, or undefined if the input is invalid
 */
const parseLocalDate = (value: string | null): Date | null | undefined => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  const parsed = parse(trimmed, localFormat, new Date(), { locale })
  return isValid(parsed) ? parsed : undefined
}

const draftDate = ref(formatLocalDate(props.modelValue))
const hasInputError = computed(() => parseLocalDate(draftDate.value) === undefined)

const setInputDate = (value: Date | null) => {
  draftDate.value = formatLocalDate(value)
}

watch(() => props.modelValue, (value) => {
  setInputDate(value)
})

const commitDraftDate = () => {
  const parsed = parseLocalDate(draftDate.value)
  // Don't commit invalid input, keeping it in the field for user correction.
  if (parsed === undefined) {
    return
  }

  emit("update:modelValue", parsed)
  setInputDate(parsed)
}

const parsePickerDate = (value: string | null): Date | null => {
  return value ? parse(value, pickerFormat, new Date(), { locale }) : null
}

const pickerDate = computed({
  get: () => props.modelValue ? format(props.modelValue, pickerFormat, {locale}) : null,
  set: (value) => {
    const parsed = parsePickerDate(value)
    emit("update:modelValue", parsed)
    setInputDate(parsed)
  }
})

const optionsFn = (date: string | null) => {
  if (!props.options || !date) {
    return true
  }
  const parsed = parsePickerDate(date)
  const { min, max } = props.options
  return !((min && parsed < min) || (max && parsed > max)) 
}

</script>