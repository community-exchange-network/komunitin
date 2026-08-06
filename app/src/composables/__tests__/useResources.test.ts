import { enableAutoUnmount } from "@vue/test-utils"
import { computed, defineComponent, nextTick, reactive, shallowRef } from "vue"
import type { Group, Member } from "../../store/model"
import type { LoadListPayload } from "../../store/resources"
import store from "../../store"
import server, { seeds } from "../../server"
import { mountComponent, waitFor } from "../../../test/vitest/utils"
import { useResource, useResources } from "../useResources"

enableAutoUnmount(afterEach)
beforeAll(() => seeds())

async function setupComposable<T>(composable: () => T) {
  let result!: T
  await mountComponent(defineComponent({
    setup() {
      result = composable()
      return () => null
    }
  }))
  return result
}

describe("useResources", () => {
  it("loads real members and reloads when the options change", async () => {
    const options = reactive<LoadListPayload>({ group: "GRP0" })
    const result = await setupComposable(() =>
      useResources<Member>("members", options, { immediate: false })
    )

    await result.load()

    expect(result.resources.value).toHaveLength(20)
    expect(result.resources.value.every(member => member.type === "members")).toBe(true)

    options.filter = { code: "EmilianoLemke57" }

    await waitFor(
      () => result.resources.value.length,
      1,
      "useResources should reload when a filter changes"
    )
    expect(result.resources.value[0].attributes.code).toBe("EmilianoLemke57")
  })
})

describe("useResource", () => {
  it("loads a member by id", async () => {
    // Mirage's schema types do not expose registered models.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = (server.schema as any).groups.findBy({ code: "GRP1" }).members.models[0]
    const result = await setupComposable(() =>
      useResource<Member>("members", { group: "GRP1", id: member.id }, { immediate: false })
    )

    const unresolved = result.resource.value

    await result.load()

    expect(result.resource.value).toMatchObject({
      type: "members",
      id: member.id,
      attributes: {
        code: member.code,
        name: member.name
      }
    })
    expect(unresolved).toBeUndefined()
  })

  it("supports id-less loads and distinguishes unresolved from absent groups", async () => {
    const groupCode = shallowRef("GRP0")
    const options = computed(() => ({ group: groupCode.value }))
    const result = await setupComposable(() =>
      useResource<Group>("groups", options, { immediate: false })
    )

    expect(result.resource.value).toBeUndefined()

    await result.load()

    expect(result.resource.value?.attributes.code).toBe("GRP0")

    groupCode.value = "missing-group"
    await nextTick()

    expect(result.resource.value).toBeUndefined()
    await waitFor(
      () => result.resource.value,
      null,
      "A missing group should resolve to null"
    )
  })

  it("keeps concurrent id-less instances of the same type independent", async () => {
    await store.dispatch("groups/load", { group: "GRP0" })
    await store.dispatch("groups/load", { group: "GRP1" })

    const result = await setupComposable(() => ({
      first: useResource<Group>("groups", { group: "GRP0", cache: Infinity }, { immediate: false }),
      second: useResource<Group>("groups", { group: "GRP1", cache: Infinity }, { immediate: false })
    }))

    await Promise.all([result.first.load(), result.second.load()])

    expect(result.first.resource.value?.attributes.code).toBe("GRP0")
    expect(result.second.resource.value?.attributes.code).toBe("GRP1")
  })
})
