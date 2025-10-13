<template>
  <line-chart 
    :options="options"
    :data="datasets"
    style="height: 300px"
  />
</template>
<script setup lang="ts">
import { computed } from 'vue'

import { Chart, Tooltip, TimeScale, LinearScale, PointElement, LineElement, Filler } from 'chart.js'
import type { ChartData, ChartOptions } from 'chart.js'
import { Line as LineChart } from 'vue-chartjs'
import "chartjs-adapter-date-fns" //overrides default date adapter as a side effect

import type { StatsInterval } from 'src/composables/currencyStats';
import { previousDate, roundDate } from 'src/composables/currencyStats'
import type { Currency } from 'src/store/model'
import { getDateLocale } from "../boot/i18n"
import formatCurrency from 'src/plugins/FormatCurrency'

Chart.register(Tooltip, Filler, LinearScale, TimeScale, PointElement, LineElement)

const props = defineProps<{
  data: number[]
  previous?: number[]
  interval: StatsInterval
  to?: Date
  isCurrency?: boolean
  currency?: Currency
  
}>()

const mainData = computed(() => {
  // Computing dates backwards from "to".
  let date = roundDate(props.to || new Date(), props.interval)
  const data = []
  for (let i = props.data.length - 1; i >= 0; i--) {
    data.unshift({
      x: date,
      y: props.data[i]
    })
    date = previousDate(date, props.interval)
  }
  return data
})

const unit = computed(() => {
  switch (props.interval) {
    case 'PT1H':
      return 'hour'
    case 'P1D':
      return 'day'
    case 'P1W':
      return 'week'
    case 'P1M':
      return 'month'
    case 'P1Y':
      return 'year'
  }
  return undefined
})


// Didn't find how to really coordinate x-axis and tooltip date formats
// in Chart.js, so we have to manually set the tooltip format here. This
// may not be 100% accurate depending on the locale.
const timeFormat = computed(() => {
  
  switch (props.interval) {  
    case 'PT1H':
      // 14 apr 3PM
      return 'MMM d, ha'
    case 'P1D':
      // Mar 3
      return 'MMM d'
    case 'P1W':
      return 'MMM d, yyyy'
    case 'P1M':
      return 'MMM yyyy'
    case 'P1Y':
      return 'yyyy'
  }
  return undefined
})

const options = computed<ChartOptions<"line">>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: {
        unit: unit.value,
        tooltipFormat: timeFormat.value,
      },
      adapters: {
        date: {
          locale: getDateLocale()
        }
      },
      grid: {
        drawTicks: false
      },
      ticks: {
        padding: 10
      }
    },
    y: {
      beginAtZero: true,
      ticks: {
        callback: props.isCurrency && props.currency ? (value: string|number) => {
          return formatCurrency(value as number, props.currency, {decimals: false})
        } : undefined,
        padding: 10
      },
      grid: {
        drawTicks: false
      }
    },
  },
  elements: {
    point: {
      backgroundColor: '#FFFFFF',
      borderWidth: 2,
      hoverBorderWidth: 2,
    }
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: (props.isCurrency && props.currency) ? (context) => {
          return formatCurrency(context.parsed.y, props.currency)
        } : undefined,
      }
    }
  }
  
}))
type TimePoint = {x: Date, y: number}
const datasets = computed<ChartData<"line", TimePoint[]>>(() => ({
  datasets: [{
    data: mainData.value,
    borderColor: '#2f7989',
    fill: '#FFFFFF',
  }]
}))
</script>