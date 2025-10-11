import type { DirectiveBinding } from "vue";

const excludedElements = ["BUTTON", "A", "INPUT"];

/**
 * Defines the directive `card-click-to`. This directive registers a
 * click event handler on the element that pushes the given route when
 * the element is clicked. If a `button`, `input` or `a` element is
 * clicked within this element, the handler is not executed.
 */
export default {
  beforeMount: (el: HTMLElement, binding: DirectiveBinding<string>) => {
    // Add mouse cursor-pointer class.
    el.classList.add("cursor-pointer");
    // Add the tabindex so it is accessible by keyboard.
    el.tabIndex = 0;

    const handler = (event: Event) => {
      // Check that the clicked element is not one of the excluded
      // elements and is not child of one of the excluded elements.
      let element = event.target as HTMLElement | null;
      while (element != null && element != el) {
        if (excludedElements.includes(element.tagName.toUpperCase())) {
          return;
        }
        element = element.parentElement;
      }
      // Go to the given route.
      binding.instance?.$router.push(binding.value);
    };
    // Execute on click.
    el.addEventListener("click", handler);
    // Execute on enter keydown.
    el.addEventListener("keyup", (event: KeyboardEvent) => {
      if (event.key == "Enter") {
        handler(event);
      }
    });
  },
};
