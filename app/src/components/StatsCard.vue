<template>
  <q-card>
    <q-card-section>
      <div class="row no-wrap items-center text-body2 text-weight-medium text-onsurface-m">
        <q-icon
          :name="icon"
          size="20px"
          class="bg-background rounded-borders q-pa-xs q-mr-sm"
        />
        {{ title }}
      </div>
      <div class="text-h4 text-weight-semi-bold text-onsurface q-mt-md">
        {{ amount }}
      </div>
      <stats-change
        v-if="change"
        :change="change"
        :sign="sign"
      />
      <div class="text-caption text-onsurface-m q-mt-sm">
        {{ text }}
      </div>
    </q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import type { StatsValue} from '@/composables/currencyStats';
import { useCurrencyStatsFormattedValue  } from '@/composables/currencyStats';
import type { Currency } from '@/store/model';
import { computed } from 'vue';
import StatsChange from './StatsChange.vue';


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
  // Extra parameters to pass to the stats composable
  parameters?: Record<string, string|number>
}>()

const options = computed(() => ({
  currency: props.currency,
  value: props.value ?? "amount",
  from: props.period ? new Date(Date.now() - (props.period)*1000) : undefined,
  change: !!(props.period),
  parameters: props.parameters
}))

const {value: amount, change, sign} = useCurrencyStatsFormattedValue(options)

</script>
