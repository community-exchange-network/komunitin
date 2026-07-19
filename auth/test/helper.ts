import { app, initializeApp } from '../src/app'
import prisma from '../src/utils/prisma'
import { disconnectPrisma } from '../src/utils/prisma'
import { resetRateLimits } from '../src/utils/rate-limit'

export async function setupTestServer() {
  await initializeApp()
  return { app }
}

export async function teardownTestServer() {
  await disconnectPrisma()
}

export async function resetDb() {
  resetRateLimits()
  await prisma.userActionToken.deleteMany()
  await prisma.oidcPayload.deleteMany()
  await prisma.user.deleteMany()
}
