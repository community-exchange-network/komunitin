import { Context } from "src/utils/context";
import { AccountStatsOptions, StatsOptions } from "src/server/request";
import { Stats, StatsInterval } from "src/model/stats";
import { StatsController } from "src/controller";
import { Prisma } from "@prisma/client";
import { PrivilegedPrismaClient, TenantPrismaClient } from "./multitenant";


/**
 * Provides statistics about the transactions and accounts in the system.
 * 
 * The statistics are provided in the form of a series of values, each value
 * corresponding to a period of time. The period of time is defined by the
 * "from" and "to" parameters.
 * 
 * The implementation makes use of heavy SQL queries to compute the statistics
 * which may be slow for large datasets. In this case we would need to:
 *  - use more efficient SQL queries if possible
 *  - use caching
 */
export class StatsControllerImpl implements StatsController {

  prismaClient: TenantPrismaClient | PrivilegedPrismaClient

  /**
   * The PrismaClient can be either a tenant client (for stats of a single currency)
   * or a global client (for stats of all currencies). 
   */
  constructor(db: TenantPrismaClient | PrivilegedPrismaClient) {
    this.prismaClient = db  
  }

  db() {
    return this.prismaClient
  }

  private async getAmountSingleValue(from: Date|undefined, to: Date|undefined) {
    const value = await this.db().transfer.aggregate({
      _sum: {
        amount: true
      },
      where: {
        updated: {
          gte: from,
          lt: to
        },
        state: "committed"
      }
    })
    return Number(value._sum.amount) ?? 0
  }

  /**
   * Provides a template for SQL query that generates a series of intervals
   * between the "from" and "to" dates, with the specified "interval".
   * 
   * Usage:
   * `
   * const sqlIntervals = this.intervalsSqlTemplate(from, to, interval)
   * const query = await this.db().$queryRaw`
   *   ${sqlIntervals}
   *   SELECT i."interval"
   *   FROM "Intervals" i
   * `
   * 
   * @param from 
   * @param to 
   * @param interval 
   * @returns 
   */
  private intervalsSqlTemplate(from: Date, to: Date, interval: StatsInterval) {
    const sqlInterval = this.sqlInterval(interval)
    const sqlDatePart = this.sqlDatePart(interval)

    return Prisma.sql`
      WITH "Intervals" AS (
        SELECT generate_series(
          date_trunc(${sqlDatePart}, ${from}::timestamp),
          ${to}::timestamp - '1 second'::interval,
          ${sqlInterval}::interval
        ) AS "interval" 
      )
    `
  }

  private truncateDate(date: Date, interval: StatsInterval) {
    const newDate = new Date(date)
    switch (interval) {
      case 'PT1H':
        newDate.setUTCMinutes(0, 0, 0)
        break
      case 'P1D':
        newDate.setUTCHours(0, 0, 0, 0)
        break
      case 'P1W':
        newDate.setUTCHours(0, 0, 0, 0)
        const weekDay = (newDate.getUTCDay() -1 + 7) % 7 // Starting Monday
        newDate.setUTCDate(newDate.getUTCDate() - weekDay)
        break
      case 'P1M':
        newDate.setUTCHours(0, 0, 0, 0)
        newDate.setUTCDate(1)
        break
      case 'P1Y':
        newDate.setUTCHours(0, 0, 0, 0)
        newDate.setUTCMonth(0, 1)
        break
    }
    return newDate
  }

  private async getAmountValues(from: Date, to: Date, interval: StatsInterval): Promise<number[]> {
    
    const sqlInterval = this.sqlInterval(interval)
    const sqlIntervals = this.intervalsSqlTemplate(from, to, interval)
    const query = await this.db().$queryRaw`
      ${sqlIntervals}
      SELECT i."interval" AS "interval", COALESCE(SUM(t."amount"), 0) AS "amount"
      FROM "Intervals" i
      LEFT JOIN "Transfer" t ON t."updated" >= i."interval" 
        AND t."updated" < LEAST(i."interval" + ${sqlInterval}::interval, ${to}::timestamp) 
        AND t."state" = 'committed'
      GROUP BY i."interval"
      ORDER BY i."interval"
      ` as Array<{ interval: Date, amount: number }>;
    
    return query.map(r => r.amount)
  }

  private async getFirstTransferDate() {
    const value = await this.db().transfer.aggregate({
      _min: {
        updated: true
      }
    })
    return value._min.updated ?? new Date()
  }

  private async getFirstAccountDate() {
    const value = await this.db().account.aggregate({
      _min: {
        created: true
      }
    })
    return value._min.created ?? new Date()
  }

  private sqlInterval(interval: StatsInterval) {
    switch (interval) {
      case 'PT1H':
        return "1 hour"
      case 'P1D':
        return "1 day"
      case 'P1W':
        return "1 week"
      case 'P1M':
        return "1 month"
      case 'P1Y':
        return "1 year"
    }
  }

  private sqlDatePart(interval: StatsInterval) {
    switch (interval) {
      case 'PT1H':
        return "hour"
      case 'P1D':
        return "day"
      case 'P1W':
        return "week"
      case 'P1M':
        return "month"
      case 'P1Y':
        return "year"
    }
  }

  /**
   * Return the sum of all transaction amounts in one Currency on the period provided by
   * the "from" and "to" parameters and grouped by the parameter "interval".
   * @param ctx 
   * @param params 
   *   - "from": string (date in ISO format) or undefined (from the beginning)
   *   - "to": string (date in ISO format) or undefined (to  the end)
   *   - "interval": string (one of "PT1H", "P1D", "P1W", "P1M", "P1Y" or undefined for single value)
   * @returns 
   */
  public async getAmount(ctx: Context, params: StatsOptions): Promise<Stats> {
    const { from, to, interval } = params

    const toDate = to ?? new Date()

    // No interval, so return single value.
    if (interval === undefined) {
      const value = await this.getAmountSingleValue(from, toDate)
      return {
        from: from,
        to: toDate,
        values: [value]
      }
    } else {
      // If interval is provided, we need to have an explicit "from" date.
      const fromDate = from ?? this.truncateDate(await this.getFirstTransferDate(), interval)
      const values = await this.getAmountValues(fromDate, toDate, interval)
      
      return {
        from: fromDate,
        to: toDate,
        interval: interval,
        values
      }
    }
  }


  private async getTransfersSingleValue(from: Date|undefined, to: Date|undefined) {
    const value = await this.db().transfer.count({
      where: {
        updated: {
          gte: from,
          lt: to
        },
        state: "committed"
      }
    })
    return value
  }
  private async getTransfersValues(from: Date, to: Date, interval: StatsInterval): Promise<number[]> {
    const sqlInterval = this.sqlInterval(interval)
    const sqlIntervals = this.intervalsSqlTemplate(from, to, interval)
    const query = await this.db().$queryRaw`
      ${sqlIntervals}
      SELECT i."interval" AS "interval", COUNT(t."id") AS "count"
      FROM "Intervals" i
      LEFT JOIN "Transfer" t ON t."updated" >= i."interval" 
        AND t."updated" < LEAST(i."interval" + ${sqlInterval}::interval, ${to}::timestamp) 
        AND t."state" = 'committed'
      GROUP BY i."interval"
      ORDER BY i."interval"
      ` as Array<{ interval: Date, count: number }>;
    
    return query.map(r => Number(r.count))
  }
  /**
   * Return the number of transfers that have been committed in the period
   * provided by the "from" and "to" parameters and grouped by the parameter
   * "interval".
   * @param ctx 
   * @param params 
   */
  public async getTransfers(ctx: Context, params: StatsOptions): Promise<Stats> {
    const { from, to, interval } = params
    const toDate = to ?? new Date()

    if (interval === undefined) {
      // Single value: count all committed transfers in the period
      const value = await this.getTransfersSingleValue(from, toDate)
      return { 
        from, 
        to: toDate, 
        values: [value]
      }
    } else {
      const fromDate = from ?? this.truncateDate(await this.getFirstTransferDate(), interval)
      const values = await this.getTransfersValues(fromDate, toDate, interval)
      
      return {
        from: fromDate,
        to: toDate,
        interval: interval,
        values
      }
    }
  }

  /**
   * Return the number of accounts that have a number of transactions within the range
   * provided by the minTransactions and maxTransactions parameters.
   * @param ctx 
   * @param params 
   */
  public async getAccounts(ctx: Context, params: AccountStatsOptions): Promise<Stats> {
    const { from, to, interval, minTransactions, maxTransactions } = params

    const toDate = to ?? new Date()
    const fromDate = from ?? this.truncateDate(await this.getFirstAccountDate(), interval ?? 'P1D')
    
    const min = minTransactions ?? 0
    const max = maxTransactions ?? Number.MAX_SAFE_INTEGER


    const sqlInterval = interval ? this.sqlInterval(interval) : undefined

    let values: number[]

    // In accouts table we have created and updated timestamps and a status field
    // that may take either "active" or "deleted" values.

    // The number of existing accounts in a given period can be computed as the number
    // of accounts created before the end of the period (regardless of current status)
    // and that have not been deleted before the start of the period (so status
    // is "deleted" and we check the updated field).

    let result;
    if (!interval) {
      /*
      const debug = await this.db().$queryRaw`
        SELECT a."id", COUNT(t."id") as "count"
          FROM "Account" a
          LEFT JOIN "Transfer" t ON (t."payerId" = a."id" OR t."payeeId" = a."id") 
            AND t."updated" >= ${fromDate} AND t."updated" < ${toDate} 
            AND t."state" = 'committed'
          WHERE a."type" <> 'virtual'
            AND a."created" < ${toDate} AND NOT (a."status" = 'deleted' AND a."updated" < ${fromDate})
          GROUP BY a."id"
        `
      console.log(debug)*/
      

      result = await this.db().$queryRaw`
        SELECT COUNT(*) as "count" FROM 
        (
          SELECT a."id"
          FROM "Account" a
          LEFT JOIN "Transfer" t ON (t."payerId" = a."id" OR t."payeeId" = a."id") 
            AND t."updated" >= ${fromDate} AND t."updated" < ${toDate} 
            AND t."state" = 'committed'
          WHERE a."type" <> 'virtual' 
            AND a."created" < ${toDate} AND NOT (a."status" = 'deleted' AND a."updated" < ${fromDate})
          GROUP BY a."id"
          HAVING COUNT(t."id") >= ${min} AND COUNT(t."id") <= ${max}
        )
        ` as Array<{ count: number }>;

    } else {
      const sqlIntervals = this.intervalsSqlTemplate(fromDate, toDate, interval)
      /*
      const debug = await this.db().$queryRaw`
        ${sqlIntervals}
        SELECT i."interval" AS "interval", a."id" AS "account", COUNT(t."id") as "count"
          FROM "Intervals" i
          LEFT JOIN "Account" a ON
            a."created" < LEAST(i."interval" + ${sqlInterval}::interval, ${toDate}) AND
            NOT (a."status" = 'deleted' AND a."updated" < i."interval")
          LEFT JOIN "Transfer" t ON (t."payerId" = a."id" OR t."payeeId" = a."id")
            AND t."updated" >= i."interval" AND t."updated" < LEAST(i."interval" + ${sqlInterval}::interval, ${toDate})
            AND t."state" = 'committed'
          GROUP BY i."interval", a."id"
          ORDER BY i."interval"
        `
      console.log(debug)
      */

      result = await this.db().$queryRaw`
        ${sqlIntervals}
        SELECT j."interval" AS "interval", COUNT(c."account") AS "count" FROM 
        "Intervals" j
        LEFT JOIN
        (
          SELECT i."interval" AS "interval", a."id" AS "account"
          FROM "Intervals" i
          LEFT JOIN "Account" a ON
            a."type" <> 'virtual' AND
            a."created" < LEAST(i."interval" + ${sqlInterval}::interval, ${toDate}) AND
            NOT (a."status" = 'deleted' AND a."updated" < i."interval")
          LEFT JOIN "Transfer" t ON (t."payerId" = a."id" OR t."payeeId" = a."id")
            AND t."updated" >= i."interval" AND t."updated" < LEAST(i."interval" + ${sqlInterval}::interval, ${toDate})
            AND t."state" = 'committed'
          GROUP BY i."interval", a."id"
          HAVING COUNT(t."id") >= ${min} AND COUNT(t."id") <= ${max}
        ) as c
        ON j."interval" = c."interval"
        GROUP BY j."interval"
        ORDER BY j."interval"
        ` as Array<{ interval: Date, count: number }>;
    }

    // Prisma returns bigint for COUNT, so we need to convert it to number.
    values = result.map(r => Number(r.count))

    return {
      from: fromDate,
      to: toDate,
      interval: interval,
      values
    }

  }

  
}