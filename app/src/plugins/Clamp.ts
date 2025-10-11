import clamp from 'clamp-js';
import type { DirectiveBinding } from 'vue';

// Directive v-clamp to be declared in directives element property.
export default function(el: HTMLElement, binding: DirectiveBinding<number> ) {
  // bind the passed attribute value to the clamp option of Clamp.js library.
  return clamp(el, {clamp : binding.value})
}


export function truncate(text: string, length: number) {
  return (text.length <= length) ? text : text.slice(0, length - 2) + '...'
}