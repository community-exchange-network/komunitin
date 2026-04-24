import { type Prisma } from "@prisma/client";
import { TenantPrismaClient } from "./multitenant";

/**
 * A simple key-value store backed by the Value database table.
 */
export class Store {
  
  constructor(readonly client: TenantPrismaClient) {}

  async get<T extends Prisma.JsonValue>(key: string): Promise<T|undefined> {
    const row = await this.client.value.findUnique({
      where: {
        tenantId_key: {
          tenantId: this.client.tenantId,
          key: key
        }
      }
    })
    return row?.value as T|undefined
  }

  async set(key: string, value: Prisma.InputJsonValue): Promise<void> {
    await this.client.value.upsert({
      where: {
        tenantId_key: {
          tenantId: this.client.tenantId,
          key: key
        }
      },
      update: { value },
      create: {
        tenantId: this.client.tenantId,
        key,
        value
      }
    })
  }

  async delete(key: string): Promise<void> {
    await this.client.value.delete({
      where: {
        tenantId_key: {
          tenantId: this.client.tenantId,
          key: key
        }
      }
    })
  }


}