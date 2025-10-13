<template>
  <q-card 
    flat
    bordered
  >
    <q-card-section class="row items-top justify-between">
      <div class="col-12 col-sm-4">
        <div class="text-overline text-onsurface-m">
          <q-icon
            :name="icon"
            size="xs"
            color="icon-dark"
          />
            {{ title }}
        </div>
        <div class="q-pt-md">
          <div>
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
          </div>
          <div class="text-caption text-onsurface-m">
            {{ text }}
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="column q-gutter-y-md">
          <div>
            <q-select :model-value="period" outlined name="period" :options="periodOptions" :label="t('period')" @update:model-value="updatePeriod" />
          </div>
          <div>
            <q-select v-model="interval" outlined name="interval" :options="intervalOptions" :label="t('interval')" />
          </div>
        </div>
      </div>
    </q-card-section>
    <q-card-section>
      <time-series-chart 
        :currency="currency"
        :is-currency="value == 'amount'"
        :data="data.values ?? []"
        :previous="data.previous"
        :interval="interval.value"
        :to="period.value.to"
      />
    </q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import type { StatsInterval, StatsValue} from 'src/composables/currencyStats';
import { roundDate, useCurrencyStats, useCurrencyStatsFormattedValue } from 'src/composables/currencyStats'
import type { Currency } from 'src/store/model'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TimeSeriesChart from './TimeSeriesChart.vue'

const props = defineProps<{
  value: StatsValue
  title: string
  icon: string
  currency: Currency
  text: string
  // Extra parameters to pass to the stats composable
  parameters?: Record<string, string|number>
}>()

// Define the periods and make them start at round times so the
// first chart value is meaningful.
const last24h = new Date()
last24h.setDate(last24h.getDate() - 1)

const last7days = new Date()
last7days.setDate(last7days.getDate() - 7)

const last30days = new Date()
last30days.setDate(last30days.getDate() - 30)

const thisQuarter = new Date()
thisQuarter.setMonth(Math.floor(thisQuarter.getMonth() / 3) * 3)
thisQuarter.setDate(1)

const lastQuarter = new Date()
lastQuarter.setMonth(Math.floor(lastQuarter.getMonth() / 3) * 3 - 3)
lastQuarter.setDate(1)

const last12months = new Date()
last12months.setFullYear(last12months.getFullYear() - 1)

const thisYear = new Date()
thisYear.setMonth(0, 1)
thisYear.setHours(0, 0, 0, 0)

const lastYear = new Date()
lastYear.setFullYear(lastYear.getFullYear() - 1)
lastYear.setMonth(0, 1)
lastYear.setHours(0, 0, 0, 0)

const last5years = new Date()
last5years.setFullYear(last5years.getFullYear() - 5)
last5years.setMonth(0, 1)
last5years.setHours(0, 0, 0, 0)

const {t} = useI18n()

const periodOptions = [
  {label: t('24hours'), value: { from: last24h } },
  {label: t('7days'), value: { from: last7days } },
  {label: t('30days'), value: { from: last30days } },
  {label: t('thisQuarter'), value: { from: thisQuarter } },
  {label: t('lastQuarter'), value: { from: lastQuarter, to: thisQuarter} },
  {label: t('12months'), value: { from: last12months } },
  {label: t('thisYear'), value: { from: thisYear } },
  {label: t('lastYear'), value: { from: lastYear, to: thisYear} },
  {label: t('last5years'), value: { from: last5years } },
  {label: t('allTime'), value: {} }
]

const period = ref(periodOptions[5]) // 12 months

// Note that intervals are always the natural ones. For example hour
// always starts at XX:00:00 and ends at XX:59:59. First and last 
// values may have less width depending on period.


// Returns -1 if the interval is disabled because it is too short for the period,
// 0 if it is enabled, and 1 if it is disabled because it is too long for the period.
const isIntervalDisabled = (intervalValue: StatsInterval, period: typeof periodOptions[number]) => {
  const periodSeconds = period.value.from ? 
    ((period.value.to?.getTime() ?? new Date().getTime()) - period.value.from.getTime()) / 1000
    : undefined
  const intervalsSeconds = {
    'PT1H': 60*60,
    'P1D': 24*60*60,
    'P1W': 7*24*60*60,
    'P1M': 30*24*60*60,
    'P1Y': 365*24*60*60
  }
  const intervalSeconds = intervalsSeconds[intervalValue]
  if (periodSeconds === undefined) {
    // If no "from" defined, allow monthly intervals or more.
    return intervalSeconds < intervalsSeconds['P1M'] ? -1 : 0
  } else {
    // Allow intervals that are less than half of the period or more than 500 times the period.
    if (periodSeconds > intervalSeconds * 500) {
      return -1
    } else if (periodSeconds < intervalSeconds * 2) {
      return 1
    } else {
      return 0
    }
  }
}

const intervalOptions = computed(() => [
  {label: t('hour'), value: 'PT1H' as const, disable: !!isIntervalDisabled('PT1H', period.value)},
  {label: t('day'), value: 'P1D' as const, disable: !!isIntervalDisabled('P1D', period.value)},
  {label: t('week'), value: 'P1W' as const, disable: !!isIntervalDisabled('P1W', period.value)},
  {label: t('month'), value: 'P1M' as const, disable: !!isIntervalDisabled('P1M', period.value)},
  {label: t('year'), value: 'P1Y' as const, disable: !!isIntervalDisabled('P1Y', period.value)},
])

const interval = ref(intervalOptions.value[3]) // Month

const updatePeriod = (value: typeof periodOptions[number]) => {
  const disabled = isIntervalDisabled(interval.value.value, value)
  if (disabled === -1) {
    // interval is too short. Take the first enabled.
    const newInterval = intervalOptions.value.find(i => isIntervalDisabled(i.value, value) === 0)
    interval.value = newInterval ?? intervalOptions.value[intervalOptions.value.length - 1]
  } else if (disabled === 1) {
    // interval is too long. Take the last enabled.
    const newInterval = intervalOptions.value.slice().reverse().find(i => isIntervalDisabled(i.value, value) === 0)
    interval.value = newInterval ?? intervalOptions.value[0]
  }
  period.value = value
}



// Get stats data for the single value
const valueOptions = computed(() => ({
  currency: props.currency,
  value: props.value,
  from: period.value.value.from,
  to: period.value.value.to,
  change: true,
  parameters: props.parameters
}))

const {value: amount, change, sign} = useCurrencyStatsFormattedValue(valueOptions)


const options = computed(() => {
  // Rounding the from date to the nearest interval break so the first
  // value has the same width as the others.
  const from = period.value.value.from ? roundDate(period.value.value.from, interval.value.value) : undefined

  return ({
    currency: props.currency,
    value: props.value,
    from: from,
    to: period.value.value.to,
    interval: interval.value.value,
    previous: false,
    parameters: props.parameters
  })
})

const data = useCurrencyStats(options)



</script>