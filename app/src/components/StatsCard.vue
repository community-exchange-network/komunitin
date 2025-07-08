<template>
  <q-card
    flat
    bordered
  >
    <q-card-section>
      <div class="text-overline text-onsurface-m">
        <q-icon
          :name="icon"
          size="xs"
          color="icon-dark"
        />
        {{ title }}
      </div>
    </q-card-section>
    <q-card-section class="q-pt-none">
      <h3 class="q-mt-none q-mb-xs">
        {{ amount }}
      </h3>
      <div 
        v-if="change"
        class="text-h6"
        :class="sign > 0 ? 'positive-amount' : 'negative-amount'"
      >
        <q-icon
          :name="sign > 0 ? 'trending_up' : 'trending_down'"
        />
        {{ change }}
      </div>
      <div class="text-caption text-onsurface-m">
        {{ text }}
      </div>
    </q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import { StatsValue, useCurrencyStatsFormattedValue  } from 'src/composables/currencyStats';
import { Currency } from 'src/store/model';
import { computed } from 'vue';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
  value: StatsValue
  title: string
  icon: string
  currency?: Currency
  /** 
   * The period for which the stats are computed, until now (in seconds).
   * */  
  period?: number
  text: string
}>()

const options = computed(() => ({
  currency: props.currency,
  value: props.value ?? "amount",
  from: props.period ? new Date(Date.now() - (props.period)*1000) : undefined,
  change: !!(props.period)
}))

const {value: amount, change, sign} = useCurrencyStatsFormattedValue(options)

</script>