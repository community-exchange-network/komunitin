import { CreditCommonsNode, CreditCommonsTransaction } from '../model/creditCommons';
import { projection } from '../server/serialize';
import TsJapi from 'ts-japi';

const { Serializer } = TsJapi

export const CreditCommonsNodeSerializer = new Serializer<CreditCommonsNode>("creditCommonsNodes", {
  version: null,
  projection: projection<CreditCommonsNode>(['peerNodePath', 'lastHash', 'vostroId']),
})
