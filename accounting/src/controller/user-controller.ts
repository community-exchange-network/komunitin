import { User } from "src/model"
import { Context } from "src/utils/context"
import { CurrencyControllerImpl } from "./currency-controller"
import { forbidden } from "src/utils/error"
import { AbstractCurrencyController } from "./abstract-currency-controller"

export class UserController extends AbstractCurrencyController {

  constructor(readonly currencyController: CurrencyControllerImpl) {
    super(currencyController)
  }

  async getUser(ctx: Context): Promise<User | undefined> {
    if (ctx.type === "system" || ctx.type === "superadmin") {
      return this.currency().admin
    }
    if (!ctx.userId) {
      return undefined
    }
    let where

    if (/^\d+$/.test(ctx.userId)) {
      const hex = parseInt(ctx.userId).toString(16) // integer to hex.

      // The id is a number. This can be a user id provided by IntegralCES
      // auth provider, where the id in the token is the Drupal user id, while
      // the user id's from the api are derived UUID-like id's.
      // We have a mapping from the id to the UUID-like id in the database:
      // 75736572-2020-[4 random digits]-[4 random digits]-[zero padded user id in hex]
      where = {
        OR: [{
          id: {
            startsWith: "75736572-2020-",
            endsWith: "-" + hex.padStart(12, "0")
          }
        }, {
          id: ctx.userId
        }]
      }
    } else {
      // Regular case, the id in the token is directly what we have in the database.
      where = { id: ctx.userId }
    }
    
    const record = await this.db().user.findFirst({ where })
    if (!record) {
      return undefined
    }
    return {id: record.id}
  }

  /**
   * Check that the current user has an account in this currency.
   * @param ctx 
   * @returns the user object
   */
  async checkUser(ctx: Context): Promise<User> {
    const user = await this.getUser(ctx)
    if (!user) {
      if (!ctx.userId) {
        throw forbidden("User id not set")
      } else {
        throw forbidden(`User ${ctx.userId} not found in currency ${this.currency().code}`)
      }
    }
    return user
  }

  /**
   * Return whether the given user is the admin.
   * @param user 
   * @returns 
   */
  isAdmin(user: User) {
    return user.id === this.currency().admin.id
  }

  /**
   * Check that the current user is the currency owner.
   * @param ctx 
   * @returns the user object
   */
  async checkAdmin(ctx: Context) {
    const user = await this.checkUser(ctx)
    if (!this.isAdmin(user)) {
      throw forbidden("Only the currency owner can perform this operation")
    }
    return user
  }
}