import { CreditCommonsEntry } from "../../src/model/creditCommons"

export const generateCcTransaction = (uuid: string = '3d8ebb9f-6a29-42cb-9d39-9ee0a6bf7f1c', sender: string = 'trunk/branch/twig/alice', includeFees: boolean = true) => {
  let entries: CreditCommonsEntry[] = [
    {
    payee: `trunk/branch2/TEST0002`,
    payer: sender,
    quant: 0.01,
    description: 'test long distance for 3 from leaf',
    metadata: { foo: 'bar' }
    }
  ]
  if (includeFees) {
   entries[0].quant = 14
   entries = entries.concat([
      {
        payee: 'trunk/branch/twig/admin',
        payer: `trunk/branch2/TEST0002`,
        quant: 2,
        description: 'Payee fee of 1 to twig/admin',
        metadata: {}
      },
      {
        payee: 'trunk/branch/admin',
        payer: `trunk/branch2/TEST0002`,
        quant: 3,
        description: 'Payee fee of 1 to branch/admin',
        metadata: {}
      },
      {
        payee: 'trunk/admin',
        payer: `trunk/branch2/TEST0002`,
        quant: 1,
        description: 'Payee fee of 1 to trunk/admin',
        metadata: {}
      }
    ])
  }
  return {
    uuid,
    state: 'V',
    workflow: '|P-PC+CX+',
    entries
  }
}
