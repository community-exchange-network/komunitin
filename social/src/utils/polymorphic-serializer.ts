import TsJapi, { type Dictionary } from 'ts-japi'

/** Deduplicate includes across variants until ts-japi handles their combined document. */
export class PolymorphicSerializer<T extends Dictionary<any>> extends TsJapi.PolymorphicSerializer<T> {
  override async serialize(...args: Parameters<TsJapi.PolymorphicSerializer<T>['serialize']>) {
    const document = await super.serialize(...args)
    if (document.included) {
      const keys = new Set<string>()
      document.included = document.included.filter((resource) => {
        const key = resource.getKey()
        const duplicate = keys.has(key)
        keys.add(key)
        return !duplicate
      })
    }
    return document
  }
}
