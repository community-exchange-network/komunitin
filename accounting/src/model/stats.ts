const StatsIntervals = ["PT1H", "P1D", "P1W", "P1M", "P1Y"] as const

export type StatsInterval = typeof StatsIntervals[number]

export type Stats = {
  values: number[]
  from?: Date
  to: Date
  interval?: StatsInterval
}
