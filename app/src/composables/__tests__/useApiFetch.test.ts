import { request, type AuthService } from "../useApiFetch"
import type { ResourceObject } from "../../store/model"

const response = () => new Response(JSON.stringify({
  data: {
    type: "groups",
    id: "group-id",
  }
}), { status: 200 })

describe("API request authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("omits the authorization header for anonymous requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const auth: AuthService = {
      accessToken: () => undefined,
      refresh: vi.fn()
    }

    await request<ResourceObject>("http://social.test/groups", {}, auth)

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.has("Authorization")).toBe(false)
  })

  it("does not try to refresh an anonymous request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    const auth: AuthService = {
      accessToken: () => undefined,
      refresh: vi.fn()
    }

    await expect(request<ResourceObject>("http://social.test/groups", {}, auth)).rejects.toBeDefined()

    expect(auth.refresh).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sends the access token for authenticated requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response())
    vi.stubGlobal("fetch", fetchMock)
    const auth: AuthService = {
      accessToken: () => "access-token",
      refresh: vi.fn()
    }

    await request<ResourceObject>("http://social.test/users/me", {}, auth)

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get("Authorization")).toBe("Bearer access-token")
  })

  it("refreshes and retries when the rejected token is still current", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(response())
    vi.stubGlobal("fetch", fetchMock)
    let accessToken = "expired-token"
    const auth: AuthService = {
      accessToken: () => accessToken,
      refresh: vi.fn(async () => {
        accessToken = "refreshed-token"
      })
    }

    await request<ResourceObject>("http://social.test/users/me", {}, auth)

    expect(auth.refresh).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryHeaders = new Headers(fetchMock.mock.calls[1][1].headers)
    expect(retryHeaders.get("Authorization")).toBe("Bearer refreshed-token")
  })

  it("does not refresh or retry after logout", async () => {
    let accessToken: string | undefined = "access-token"
    const fetchMock = vi.fn().mockImplementationOnce(async () => {
      accessToken = undefined
      return new Response(null, { status: 401 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const auth: AuthService = {
      accessToken: () => accessToken,
      refresh: vi.fn()
    }

    await expect(request<ResourceObject>("http://social.test/users/me", {}, auth)).rejects.toBeDefined()

    expect(auth.refresh).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
