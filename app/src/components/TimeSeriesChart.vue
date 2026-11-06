<template>
  <line-chart 
    :options="options"
    :data="datasets"
    style="height: 260px"
  />
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { getCssVar } from 'quasar'

import { Chart, Tooltip, TimeScale, LinearScale, PointElement, LineElement } from 'chart.js'
import type { ChartData, ChartOptions } from 'chart.js'
import { Line as LineChart } from 'vue-chartjs'
import "chartjs-adapter-date-fns" //overrides default date adapter as a side effect

import type { StatsInterval } from '@/composables/currencyStats';
import { previousDate, roundDate } from '@/composables/currencyStats'
import type { Currency } from '@/store/model'
import { getDateLocale } from "../boot/i18n"
import formatCurrency from '@/plugins/FormatCurrency'

Chart.register(Tooltip, LinearScale, TimeScale, PointElement, LineElement)

// Theme: app font, recessive axes and grid, the series in the primary color and tooltips
// as the app tooltips. Colors are palette tokens, defined as CSS variables in app.scss.
const token = (name: string) => getCssVar(name);
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily || 'sans-serif';
Chart.defaults.color = token('onsurface-m') ?? '#000000';
const gridColor = token('divider')
const lineColor = token('primary')
const tooltipBackground = token('tooltip-background')
const tooltipColor = token('tooltip-color')

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
  // Show the tooltip for the nearest date, not only when hovering the point itself.
  interaction: {
    mode: 'index',
    intersect: false
  },
  scales: {
    x: {
      type: 'time',
      time: {
        unit: unit.value,
        tooltipFormat: timeFormat.value,
        // Short month labels; the year is only shown at year boundaries (major ticks).
        displayFormats: {
          month: 'MMM',
          year: 'yyyy'
        }
      },
      adapters: {
        date: {
          locale: getDateLocale()
        }
      },
      grid: {
        display: false
      },
      border: {
        color: gridColor
      },
      // Few, horizontal labels. Major ticks (year boundaries) are kept when skipping labels.
      ticks: {
        padding: 10,
        maxRotation: 0,
        autoSkipPadding: 16,
        maxTicksLimit: 6,
        major: {
          enabled: props.interval === 'P1M'
        },
        font: (context) => context.tick?.major ? { weight: 600 } : undefined
      }
    },
    y: {
      beginAtZero: true,
      ticks: {
        callback: props.isCurrency && props.currency ? (value: string|number) => {
          return formatCurrency(value as number, props.currency, {decimals: false})
        } : undefined,
        padding: 10,
        maxTicksLimit: 5
      },
      grid: {
        drawTicks: false,
        color: gridColor
      },
      border: {
        display: false
      }
    },
  },
  elements: {
    point: {
      radius: 0,
      hoverRadius: 5,
      backgroundColor: '#FFFFFF',
      borderWidth: 2,
      hoverBorderWidth: 2,
    },
    line: {
      borderWidth: 2,
      // Smooth curve that never overshoots the data.
      cubicInterpolationMode: 'monotone'
    }
  },
  plugins: {
    tooltip: {
      backgroundColor: tooltipBackground,
      titleColor: tooltipColor,
      bodyColor: tooltipColor,
      titleFont: { weight: 600 },
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
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
    borderColor: lineColor,
    pointBorderColor: lineColor,
    fill: false,
  }]
}))
</script>