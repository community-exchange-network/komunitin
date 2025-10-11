import "../index";
import { config } from "src/utils/config";
import type { ResourceObject } from "src/store/model";
import { seeds } from "../index";

const urlSocial = config.SOCIAL_URL;
const urlAccounting = config.ACCOUNTING_URL;

describe("MirageJS Server", () => {
  beforeAll(async () => {
    seeds();
  })

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
    const response = await fetch(`${urlSocial}/GRP0/members/EmilianoLemke57?include=account`);
    const data = await response.json();
    const account = data.included.find((resource: ResourceObject) => resource.type == "accounts");
    expect(account.meta.external).toBe(true);
    expect(account.links.self).toBe(`${urlAccounting}/GRP0/accounts/${account.id}`);
    expect(account.attributes).toBeUndefined();
    expect(account.relationships).toBeUndefined();
  });
})