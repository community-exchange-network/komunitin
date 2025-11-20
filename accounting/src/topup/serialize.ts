import { Relator, Serializer } from "ts-japi";
import { Topup, AccountTopupSettings, TopupSettings } from "./model";
import { AccountSerializer, projection, TransferSerializer, UserSerializer } from "../server/serialize";
import { Account, Transfer, User } from "../model";

export const TopupSerializer = new Serializer<Topup>("topups", {
  version: null,
  projection: projection<Topup>(['status', 'depositAmount', 'depositCurrency', 'receiveAmount', 'paymentProvider', 'created', 'updated']),
  relators: {
    account: new Relator<Topup, Account>(async (topup) => {
      return topup.account
    }, AccountSerializer, { relatedName: "account" }),
    user: new Relator<Topup, User>(async (topup) => {
      return topup.user
    }, UserSerializer, { relatedName: "user" }),
    transfer: new Relator<Topup, Transfer>(async (topup) => {
      return topup.transfer
    }, TransferSerializer, { relatedName: "transfer" }),
  }
})

export const TopupSettingsSerializer = new Serializer<TopupSettings>("topup-settings", {
  version: null,
  projection: projection<TopupSettings>(['enabled', 'depositCurrency', 'rate', 'minAmount', 'maxAmount', 'paymentProvider']),
  relators: {}
})

export const TopupAccountSettingsSerializer = new Serializer<AccountTopupSettings>("account-topup-settings", {
  version: null,
  projection: projection<AccountTopupSettings>(['allowTopup']),
  relators: {}
})