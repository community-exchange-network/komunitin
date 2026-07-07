import { Adapter, AdapterPayload } from 'oidc-provider'
import prisma from '../utils/prisma'

export class PrismaAdapter implements Adapter {
  constructor(private name: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null

    await prisma.oidcPayload.upsert({
      where: { id },
      update: {
        payload: payload as any,
        expiresAt,
        grantId: payload.grantId,
        userCode: payload.userCode,
        uid: payload.uid,
      },
      create: {
        id,
        type: this.name,
        payload: payload as any,
        expiresAt,
        grantId: payload.grantId,
        userCode: payload.userCode,
        uid: payload.uid,
      },
    })
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    const data = await prisma.oidcPayload.findUnique({
      where: { id },
    })

    if (!data) return undefined

    // Check expiration
    if (data.expiresAt && data.expiresAt < new Date()) {
      await this.destroy(id)
      return undefined
    }

    return data.payload as unknown as AdapterPayload
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const data = await prisma.oidcPayload.findFirst({
      where: { userCode, type: this.name },
    })

    if (!data) return undefined

    if (data.expiresAt && data.expiresAt < new Date()) {
      await this.destroy(data.id)
      return undefined
    }

    return data.payload as unknown as AdapterPayload
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const data = await prisma.oidcPayload.findFirst({
      where: { uid, type: this.name },
    })

    if (!data) return undefined

    if (data.expiresAt && data.expiresAt < new Date()) {
      await this.destroy(data.id)
      return undefined
    }

    return data.payload as unknown as AdapterPayload
  }

  async destroy(id: string): Promise<void> {
    await prisma.oidcPayload.deleteMany({
      where: { id },
    })
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await prisma.oidcPayload.deleteMany({
      where: { grantId },
    })
  }

  async consume(id: string): Promise<void> {
    const record = await prisma.oidcPayload.findUnique({ where: { id } })
    if (record) {
      const payload = record.payload as any
      payload.consumed = true
      await prisma.oidcPayload.update({
        where: { id },
        data: {
          consumedAt: new Date(),
          payload,
        },
      })
    }
  }
}

export const adapterFactory = (name: string) => new PrismaAdapter(name)
