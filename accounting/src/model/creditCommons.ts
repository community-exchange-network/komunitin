import { Account } from "./account";

export interface CreditCommonsNode {
  peerNodePath: string,
  ourNodePath: string,
  lastHash: string,
  url: string,
  vostroId: string,
}

export interface CreditCommonsEntry {
  payer: string,
  payee: string,
  quant: number,
  description: string,
  metadata: { [key: string]: string }
}

export interface CreditCommonsTransaction {
  uuid: string,
  state: string,
  workflow: string,
  entries: CreditCommonsEntry[],
  version: number
}
