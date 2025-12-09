<template>
  <q-item
    tag="label"
    style="padding-left: 12px; padding-right: 12px;"
    :disable="disable"
  >
    <q-item-section>
      <q-item-label>
        {{ label }}
      </q-item-label>
      <q-item-label
        v-if="caption"
        caption
      >
        {{ caption }}
      </q-item-label>
    </q-item-section>
    <q-item-section avatar>
      <q-toggle
        v-model="value"
        :true-value="trueValue"
        :false-value="falseValue"
        :toggle-indeterminate="toggleIndeterminate"
        :indeterminate-value="null"
        :disable="disable"
      />
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  modelValue?: boolean | string | number
  label: string
  hint?: string
  trueValue?: boolean | string | number
  falseValue?: boolean | string | number
  defaultValue?: boolean | string | number
  toggleIndeterminate?: boolean
  disable?: boolean
}>(), {
  trueValue: true,
  falseValue: false,
  modelValue: undefined,
  hint: undefined,
  defaultValue: undefined,
  toggleIndeterminate: false,
  disable: false,
})

const emit = defineEmits<{
  (e: "update:modelValue", value:  boolean | string | number | null): void
}>()

const value = computed({
  get: () => props.modelValue ?? (props.toggleIndeterminate ? null : props.defaultValue),
  set: (value:  boolean | string | number | null) => emit("update:modelValue", value),
})

const { t } = useI18n()

const caption = computed(() =>  {
  let text = props.hint ?? ""
  if (props.defaultValue !== undefined) {
    if (text.length > 0) {
      text += " "
    }
    const defValue = props.defaultValue === props.trueValue ? t("yes") : t("no")
    text += "(" + t("defaultIs", { value: defValue }) + ")"
  }
  return text
})
</script>