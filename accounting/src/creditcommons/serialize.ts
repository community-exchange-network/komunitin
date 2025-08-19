import { CreditCommonsNode, CreditCommonsTransaction } from 'src/model/creditCommons';
import { projection } from 'src/server/serialize';
import { Serializer } from 'ts-japi';

export const CreditCommonsNodeSerializer = new Serializer<CreditCommonsNode>("creditCommonsNodes", {
  version: null,
  projection: projection<CreditCommonsNode>(['peerNodePath', 'lastHash', 'vostroId']),
})

export const CreditCommonsMessageSerializer = new Serializer<{ message: string }>("message", {
  version: null,
  projection: projection<{ message: string }>(['message']),
})

export const CreditCommonsTransactionSerializer = new Serializer<CreditCommonsTransaction>("creditCommonsTransactions", {
  version: null,
  projection: projection<CreditCommonsTransaction>(['uuid', 'state', 'workflow', 'entries']),
})