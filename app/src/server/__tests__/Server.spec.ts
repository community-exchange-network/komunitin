import "../index";
import { config } from "src/utils/config";
import type { ResourceObject } from "src/store/model";
import { seeds } from "../index";

const urlAuth = config.AUTH_URL;
const urlSocial = config.SOCIAL_URL;
const urlAccounting = config.ACCOUNTING_URL;
const authHeaders = { Authorization: "Bearer test_user_access_token" };

async function json(response: Response) {
  return response.json();
}

describe("MirageJS Server", () => {
  beforeAll(async () => {
    seeds();
  })

  it("mocks auth token and JSON action-token flows", async () => {
    const token = await fetch(`${urlAuth}/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        username: "noether@komunitin.org",
        password: "komunitin",
        scope: "social:read"
      })
    });
    expect(await json(token)).toMatchObject({
      access_token: "test_user_access_token",
      refresh_token: "test_user_refresh_token",
      token_type: "Bearer",
      scope: "social:read"
    });

    const unsupportedGrant = await fetch(`${urlAuth}/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "authorization_code", code: "abc" })
    });
    expect(unsupportedGrant.status).toBe(400);

    const formManagement = await fetch(`${urlAuth}/reset-password`, {
      method: "POST",
      body: new URLSearchParams({ email: "noether@komunitin.org" })
    });
    expect(formManagement.status).toBe(400);

    const actionToken = await fetch(`${urlAuth}/action-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "passwordReset", userId: "user-1", email: "noether@komunitin.org" })
    });
    const { token: resetToken } = await json(actionToken);

    const changePassword = () => fetch(`${urlAuth}/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password: "komunitin" })
    });

    expect((await changePassword()).status).toBe(200);
    expect((await changePassword()).status).toBe(400);

    const unsubscribeActionToken = await fetch(`${urlAuth}/action-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "unsubscribe", userId: "user-1", email: "unsubscribe@example.org" })
    });
    const { token: unsubscribeToken } = await json(unsubscribeActionToken);
    const redeem = await fetch(`${urlAuth}/redeem-action-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: unsubscribeToken, purpose: "unsubscribe" })
    });
    expect(await json(redeem)).toMatchObject({
      userId: "user-1",
      email: "unsubscribe@example.org",
      purpose: "unsubscribe"
    });
  });

  it ("includes currency external resource", async () => {
    const response = await fetch(`${urlSocial}/GRP0?include=currency`);
    const data = await response.json();
    const currency = data.included.find((resource: ResourceObject) => resource.type == "currencies");
    expect(currency.meta.external).toBe(true);
    expect(currency.links.self).toBe(`${urlAccounting}/GRP0/currency`);
    expect(currency.attributes).toBeUndefined();
    expect(currency.relationships).toBeUndefined();
  });

  it("includes account external resource", async() => {
    const response = await fetch(`${urlSocial}/GRP0/members?filter[code]=EmilianoLemke57&include=account`);
    const data = await response.json();
    const account = data.included.find((resource: ResourceObject) => resource.type == "accounts");
    expect(account.meta.external).toBe(true);
    expect(account.links.self).toBe(`${urlAccounting}/GRP0/accounts/${account.id}`);
    expect(account.attributes).toBeUndefined();
    expect(account.relationships).toBeUndefined();
  });

  it("loads user memberships from /users/:id/members", async () => {
    const me = await fetch(`${urlSocial}/users/me?include=settings`, { headers: authHeaders });
    const meData = await json(me);
    expect((meData.included ?? []).some((resource: ResourceObject) => resource.type == "members")).toBe(false);

    const members = await fetch(`${urlSocial}/users/${meData.data.id}/members?include=group,group.currency,account&page[size]=1`, {
      headers: authHeaders
    });
    const membersData = await json(members);
    expect(membersData.data).toHaveLength(1);
    expect(membersData.data[0].attributes.contacts[0]).toEqual(expect.objectContaining({
      type: expect.any(String),
      value: expect.any(String)
    }));
    expect(membersData.data[0].attributes.status).toBe("active");
    expect(membersData.data[0].attributes.state).toBeUndefined();
    expect(membersData.data[0].relationships.contacts).toBeUndefined();
    expect(membersData.meta.count).toBe(1);
    expect(membersData.links.next).toBeNull();
    expect(membersData.included.some((resource: ResourceObject) => resource.type == "groups")).toBe(true);
    expect(membersData.included.some((resource: ResourceObject) => resource.type == "currencies")).toBe(true);
    expect(membersData.included.some((resource: ResourceObject) => resource.type == "accounts")).toBe(true);
  });

  it("rejects legacy social shapes", async () => {
    expect((await fetch(`${urlSocial}/users/me?include=members`, { headers: authHeaders })).status).toBe(400);
    expect((await fetch(`${urlSocial}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          type: "users",
          attributes: {
            email: "new@example.com",
            password: "komunitin"
          }
        }
      })
    })).status).toBe(400);
  });

  it("mocks new social queries and uploads", async () => {
    const groups = await fetch(`${urlSocial}/groups?near=41.39,2.17&sort=distance&include=currency`);
    expect(groups.status).toBe(200);
    const groupsData = await json(groups);
    expect(groupsData.data[0].attributes.contacts[0]).toEqual(expect.objectContaining({
      type: expect.any(String),
      value: expect.any(String)
    }));
    expect(groupsData.data[0].attributes.status).toBe("active");
    expect(groupsData.data[0].attributes.state).toBeUndefined();
    expect(groupsData.data[0].relationships.contacts).toBeUndefined();

    const posts = await fetch(`${urlSocial}/GRP0/posts?filter[type]=offers&include=member,category&page[size]=1`);
    const postsData = await json(posts);
    expect(postsData.data).toHaveLength(1);
    expect(postsData.data[0].type).toBe("offers");
    expect(postsData.data[0].attributes.title).toBeTruthy();
    expect(postsData.data[0].attributes.description).toBeTruthy();
    expect(postsData.data[0].attributes.value).toBeTruthy();
    expect(postsData.data[0].attributes.type).toBeUndefined();

    const needs = await fetch(`${urlSocial}/GRP0/posts?filter[type]=needs&page[size]=1`);
    const needsData = await json(needs);
    expect(needsData.data).toHaveLength(1);
    expect(needsData.data[0].type).toBe("needs");
    expect(needsData.data[0].attributes.type).toBeUndefined();
    expect(needsData.data[0].attributes.fulfilled).toBeNull();

    const formData = new FormData();
    formData.append("file", new File(["hello"], "hello.txt", { type: "text/plain" }));
    formData.append("resourceType", "member-image");

    const upload = await fetch(`${urlSocial}/GRP0/files/upload`, {
      method: "POST",
      headers: authHeaders,
      body: formData
    });
    const uploadData = await json(upload);
    expect(upload.status).toBe(201);
    expect(uploadData.data).toMatchObject({
      type: "files",
      attributes: {
        url: "https://files.example/hello.txt",
        mime: "text/plain",
        key: "hello.txt",
        size: 5,
        filename: "hello.txt",
        resourceType: "member-image"
      }
    });
  });
})
