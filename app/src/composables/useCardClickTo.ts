import { toValue, type MaybeRefOrGetter } from "vue"
import { useRouter, type RouteLocationRaw } from "vue-router"

const interactiveSelector = [
  "a",
  "button",
  "input",
  "label",
  "select",
  "summary",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[tabindex]:not([tabindex='-1'])"
].join(",")

const hasInteractiveTarget = (event: Event) => {
  for (const target of event.composedPath()) {
    if (target === event.currentTarget) {
      break
    }
    if (target instanceof Element && target.matches(interactiveSelector)) {
      return true
    }
  }
  return false
}

/** Makes an element navigate like a link without hijacking its nested controls. */
export const useCardClickTo = (to: MaybeRefOrGetter<RouteLocationRaw>) => {
  const router = useRouter()
  const navigate = (event: Event) => {
    if (!event.defaultPrevented && !hasInteractiveTarget(event)) {
      router.push(toValue(to))
    }
  }
  const onKeyup = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      navigate(event)
    }
  }

  return {
    class: "cursor-pointer",
    role: "link",
    tabindex: 0,
    onClick: navigate,
    onKeyup
  }
}
