import { Prisma } from "@prisma/client"
import { NextFunction, Request, Response } from "express"
import { z } from "zod"
import { validateUserId } from "../../server/auth-compat"
import { badRequest, notFound } from "../../utils/error"
import prisma from "../../utils/prisma";
import { serializeSubscription } from "./subscriptions.serialize"

// Validation schema for subscription data (JSON:API format)
const subscriptionSchema = z.object({
  data: z.object({
    type: z.literal("subscriptions"),
    attributes: z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
      }),
      meta: z.record(z.unknown()).optional(),
    }),
    relationships: z.object({
      user: z.object({
        data: z.object({
          id: z.string().uuid(),
          type: z.literal("users"),
        }),
      }),
    }),
  }),
})

export const upsertSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params
    
    // Validate request body
    const validatedData = subscriptionSchema.parse(req.body)
    const userId = validatedData.data.relationships.user.data.id
    
    validateUserId(req, userId)
    
    const { endpoint, keys, meta: inputMeta } = validatedData.data.attributes
    const meta = inputMeta as Prisma.InputJsonValue ?? Prisma.DbNull

    // Note that a single device (endpoint) can only be associated with one user
    // at a time. So a device will only receive notifications for the user that last
    // registered the subscription.
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        tenantId: code,
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        meta,
      },
      update: {
        // Update in case user or keys changed for this endpoint
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        meta,
      },
    })

    const response = {
      links: {
        self: `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}/${subscription.id}`,
      },
      data: serializeSubscription(subscription),
    }

    res.status(200).json(response)
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(
        badRequest('Input validation failed', {
          cause: err,
          details: {
            errors: err.errors.map(e => ({
              source: e.path,
              message: e.message,
            })),
          }
        })
      )
      return
    }
    next(err)
  }
}

export const deleteSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, id } = req.params

    // Find the subscription to ensure it belongs to the user
    const subscription = await prisma.pushSubscription.findFirst({
      where: {
        id,
        tenantId: code,
      },
    })

    if (!subscription) {
      throw notFound()
    }

    validateUserId(req, subscription.userId)

    // Delete the subscription
    await prisma.pushSubscription.delete({
      where: { id },
    })

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
