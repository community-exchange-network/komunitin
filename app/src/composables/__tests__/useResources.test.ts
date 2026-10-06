import { enableAutoUnmount } from "@vue/test-utils"
import { Notify } from "quasar"
import { computed, defineComponent, nextTick, reactive, shallowRef } from "vue"
import KError, { KErrorCode } from "../../KError"
import type { Group, Member, ResourceObject } from "../../store/model"
import type { LoadListPayload } from "../../store/resources"
import store from "../../store"
import server, { seeds } from "../../server"
import { mountComponent, waitFor } from "../../../test/vitest/utils"
import { useAllResources, useResource, useResources } from "../useResources"
import { useMergedResources } from "../useMergedResources"

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

    expect(result.error.value).toBeUndefined()
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

  it("captures and rethrows list and pagination errors", async () => {
    const result = await setupComposable(() =>
      useResources<Member>("members", { group: "GRP0" }, { immediate: false })
    )
    const dispatch = vi.spyOn(store, "dispatch")
    vi.mocked(Notify.create).mockClear()

    try {
      dispatch.mockRejectedValueOnce(new Error("List failed"))

      await expect(result.load()).rejects.toMatchObject({
        code: KErrorCode.UnknownScript,
        message: "List failed"
      })

      expect(result.error.value).toMatchObject({
        code: KErrorCode.UnknownScript,
        message: "List failed"
      })
      expect(result.loading.value).toBe(false)

      await result.load()

      expect(result.error.value).toBeUndefined()
      expect(result.resources.value).toHaveLength(20)

      dispatch.mockRejectedValueOnce(new KError(KErrorCode.UnknownServer))

      await expect(result.loadNext()).rejects.toMatchObject({
        code: KErrorCode.UnknownServer
      })

      expect(result.error.value?.code).toBe(KErrorCode.UnknownServer)
      expect(result.loading.value).toBe(false)
      expect(Notify.create).not.toHaveBeenCalled()
    } finally {
      dispatch.mockRestore()
    }
  })
})

describe("useResource", () => {
  it("does not reload when option watching is disabled", async () => {
    const groupCode = shallowRef("GRP0")
    const options = computed(() => ({ group: groupCode.value }))
    const result = await setupComposable(() =>
      useResource<Group>("groups", options, { immediate: false, watch: false })
    )
    const dispatch = vi.spyOn(store, "dispatch")

    try {
      await result.load()
      expect(result.resource.value?.attributes.code).toBe("GRP0")

      dispatch.mockClear()
      groupCode.value = "GRP1"
      await nextTick()

      expect(dispatch).not.toHaveBeenCalled()
      expect(result.resource.value?.attributes.code).toBe("GRP0")
    } finally {
      dispatch.mockRestore()
    }
  })

  it("loads a member by id", async () => {
    // Mirage's schema types do not expose registered models.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = (server.schema as any).groups.findBy({ code: "GRP1" }).members.models[0]
    const result = await setupComposable(() =>
      useResource<Member>("members", { group: "GRP1", id: member.id }, { immediate: false })
    )

    const unresolved = result.resource.value
    expect(result.error.value).toBeUndefined()

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

  it("stores NotFound and clears it when complete options change to a valid resource", async () => {
    const groupCode = shallowRef("GRP0")
    const options = computed(() => ({ group: groupCode.value }))
    const result = await setupComposable(() =>
      useResource<Group>("groups", options, { immediate: false })
    )
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    try {
      expect(result.resource.value).toBeUndefined()

      await result.load()

      expect(result.resource.value?.attributes.code).toBe("GRP0")

      groupCode.value = "missing-group"
      await nextTick()

      expect(result.resource.value).toBeUndefined()
      await waitFor(
        () => result.error.value?.code,
        KErrorCode.NotFound,
        "A missing group should expose NotFound"
      )
      expect(result.resource.value).toBeUndefined()

      groupCode.value = "GRP1"
      await waitFor(
        () => result.resource.value?.attributes.code,
        "GRP1",
        "Changing any resource option should reload"
      )
      expect(result.error.value).toBeUndefined()
    } finally {
      consoleError.mockRestore()
    }
  })

  it("captures and rethrows errors from load and update", async () => {
    // Mirage's schema types do not expose registered models.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const member = (server.schema as any).groups.findBy({ code: "GRP1" }).members.models[0]
    const result = await setupComposable(() =>
      useResource<Member>("members", { group: "GRP1", id: member.id }, { immediate: false })
    )
    const dispatch = vi.spyOn(store, "dispatch")

    try {
      dispatch.mockRejectedValueOnce(new Error("Load failed"))

      await expect(result.load()).rejects.toMatchObject({
        code: KErrorCode.UnknownScript,
        message: "Load failed"
      })

      expect(result.error.value).toMatchObject({
        code: KErrorCode.UnknownScript,
        message: "Load failed"
      })

      await result.load()
      expect(result.error.value).toBeUndefined()

      dispatch.mockRejectedValueOnce(new KError(KErrorCode.Forbidden))

      await expect(result.update({ attributes: { name: "Ignored" } })).rejects.toMatchObject({
        code: KErrorCode.Forbidden
      })

      expect(result.error.value?.code).toBe(KErrorCode.Forbidden)
      expect(result.loading.value).toBe(false)
    } finally {
      dispatch.mockRestore()
    }
  })

  it("captures cached identity synchronously and keeps concurrent instances independent", async () => {
    await store.dispatch("groups/load", { group: "GRP0" })
    await store.dispatch("groups/load", { group: "GRP1" })

    const result = await setupComposable(() => ({
      first: useResource<Group>("groups", { group: "GRP0", cache: Infinity }, { immediate: false }),
      second: useResource<Group>("groups", { group: "GRP1", cache: Infinity }, { immediate: false })
    }))

    const firstLoad = result.first.load()
    expect(result.first.resource.value?.attributes.code).toBe("GRP0")
    expect(result.first.loaded.value).toBe(false)

    const secondLoad = result.second.load()
    expect(result.second.resource.value?.attributes.code).toBe("GRP1")
    expect(result.second.loaded.value).toBe(false)

    await Promise.all([firstLoad, secondLoad])

    expect(result.first.resource.value?.attributes.code).toBe("GRP0")
    expect(result.second.resource.value?.attributes.code).toBe("GRP1")
    expect(result.first.loaded.value).toBe(true)
    expect(result.second.loaded.value).toBe(true)
  })
})

describe("resource collection wrappers", () => {
  it("loads all resources only once when created", async () => {
    const dispatch = vi.spyOn(store, "dispatch")

    try {
      const result = await setupComposable(() =>
        useAllResources<Member>("members", { group: "GRP1" })
      )

      await waitFor(
        () => result.loading.value,
        false,
        "useAllResources should finish loading"
      )

      const listLoads = dispatch.mock.calls.filter(([type]) => type === "members/loadList")
      expect(listLoads).toHaveLength(1)
    } finally {
      dispatch.mockRestore()
    }
  })

  it("stops load-all pagination and exposes the captured error", async () => {
    const result = await setupComposable(() =>
      useAllResources<Member>("members", { group: "GRP0" }, { immediate: false })
    )
    const originalDispatch = store.dispatch.bind(store)
    const dispatch = vi.spyOn(store, "dispatch").mockImplementation((type, payload) =>
      String(type) === "members/loadNext"
        ? Promise.reject(new KError(KErrorCode.UnknownServer))
        : originalDispatch(type, payload)
    )

    try {
      await expect(result.loadAll()).rejects.toMatchObject({
        code: KErrorCode.UnknownServer
      })

      expect(result.resources.value).toHaveLength(20)
      expect(result.error.value?.code).toBe(KErrorCode.UnknownServer)
    } finally {
      dispatch.mockRestore()
    }
  })

  it("exposes the first captured merged-resource error", async () => {
    const result = await setupComposable(() =>
      useMergedResources<ResourceObject>(["members", "groups"], { group: "GRP0" }, { immediate: false })
    )
    const dispatch = vi.spyOn(store, "dispatch").mockRejectedValue(new Error("Merged load failed"))

    try {
      await expect(result.load()).rejects.toMatchObject({
        code: KErrorCode.UnknownScript,
        message: "Merged load failed"
      })

      expect(result.error.value).toMatchObject({
        code: KErrorCode.UnknownScript,
        message: "Merged load failed"
      })
    } finally {
      dispatch.mockRestore()
    }
  })
})
