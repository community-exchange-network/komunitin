<template>
  <q-input 
    v-model="amount"
    name="amount"
    :label="$t('amountIn', {currency: currency.attributes.namePlural})"
    outlined
    required
    :rules="[v => !!v || $t('fieldRequired'), (value: string) => amountValid(value) || $t('invalidAmount')]"
    @blur="format"
  >
    <template #append>
      <span class="text-h6 text-onsurface-m">{{ currency.attributes.symbol }}</span>
    </template>
  </q-input>
</template>
<script setup lang="ts">
import { ref, watch } from "vue"
import { parseAmount } from "src/plugins/FormatCurrency"
import type { Currency } from "src/store/model"

const props = defineProps<{
  modelValue: number|undefined,
  currency: Currency
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const amountValid = (value: string) => {
  const amount = parseAmount(value, props.currency)
  return amount !== false && amount >= 0
}
// Not using FormatCurrency because FormatCurrency localizes the number but poarseAmount does not
// recognizes localized numeric strings.
const formatAmount = (value: number|undefined) => {
  return value === undefined ? "" : 
    (value / 10 ** props.currency.attributes.scale).toFixed(props.currency.attributes.decimals)
}

const amount = ref<string>(formatAmount(props.modelValue))

watch(amount, (value) => {
  const numeric = parseAmount(value, props.currency)
  if (numeric !== false) {
    emit('update:modelValue', numeric)
  }
})
watch(() => props.modelValue, (value) => {
  // Only update the input if the value is really different (not just differently formatted)
  const current = parseAmount(amount.value, props.currency)
  if (current != value) {
    amount.value = formatAmount(value)
  }
})
const format = () => {
  const numeric = parseAmount(amount.value, props.currency)
  amount.value = formatAmount(numeric === false ? undefined : numeric)
}

</script>