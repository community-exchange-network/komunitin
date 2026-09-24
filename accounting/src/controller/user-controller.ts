import { User } from "../model"
import { Context } from "../utils/context"
import { CurrencyControllerImpl } from "./currency-controller"
import { forbidden } from "../utils/error"
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

    const record = await this.db().user.findFirst({ where: { id: ctx.userId } })
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
