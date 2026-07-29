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
      accessToken: () => null,
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
})
