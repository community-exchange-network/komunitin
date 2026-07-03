const StatsIntervals = ["PT1H", "P1D", "P1W", "P1M", "P1Y"] as const

export type StatsInterval = typeof StatsIntervals[number]

export type Stats = {
  /**
   * Numeric values for the requested metric. The length depends on the interval and the time range requested.
   */
  values: number[]
  from?: Date
  to: Date
  interval?: StatsInterval
}

export type AccountsStats = {
  /**
   * Numeric values for the requested metric, indexed by account ID.
   */
  values: Record<string, number>
  from?: Date
  to: Date
}