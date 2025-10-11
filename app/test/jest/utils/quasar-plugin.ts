/* eslint-disable @typescript-eslint/no-explicit-any */
import {Quasar, LocalStorage, Loading} from "quasar";
import * as quasar from "quasar"


// Get an object containing all Quasar Vue components.
export const qComponents = Object.keys(quasar).reduce((object, key) => {
  const val = quasar[key as keyof typeof quasar] as any;
  if (val && val.name && val.name.startsWith("Q") && val.setup) {
    object[key] = val
  }
  return object
}, {} as any);

// Get an object containing all Quasar Vue directives.
export const qDirectives = Object.keys(quasar).reduce((object, key) => {
  const val = quasar[key as keyof typeof quasar] as any;
  if (val && val.name && !val.name.startsWith("Q") && 
    ['created', 'beforeMount', 'mounted', 'beforeUpdate', 'updated', 'beforeUnmount', 'unmounted'].some(m => m in val)) {
    object[key] = val
  }
  return object
}, {} as any);


export const quasarPlugin = [Quasar, {
  plugins: [LocalStorage, Loading],
  components: qComponents,
  directives: qDirectives
}] as [typeof Quasar, any];