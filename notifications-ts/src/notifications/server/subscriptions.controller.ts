import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import prisma from "../../utils/prisma"
import { serializeSubscription } from "./subscriptions.serialize"
import { Prisma } from "@prisma/client"

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
  }),
})

export const upsertSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params
    const auth = (req as any).auth
    // TODO: use the userId from payload (UUID) but validate it matches the one
    // in the auth payload (may be just numeric, due to Drupal issue). PLace the
    // check function in auth-compat.ts (when branch is merged).
    const userId = auth?.payload.sub

    if (!userId) {
      throw new Error("User not authenticated")
    }

    // Validate request body
    const validatedData = subscriptionSchema.parse(req.body)
    
    const { endpoint, keys, meta: inputMeta } = validatedData.data.attributes
    const meta = inputMeta as Prisma.InputJsonValue ?? Prisma.DbNull

    // Upsert subscription - if endpoint exists, update it; otherwise create new
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
      res.status(400).json({ 
        errors: err.errors.map(e => ({
          status: '400',
          title: 'Validation Error',
          detail: e.message,
          source: { pointer: `/data/attributes/${e.path.join('/')}` }
        }))
      })
      return
    }
    next(err)
  }
}

export const deleteSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, id } = req.params
    const auth = (req as any).auth
    const userId = auth?.payload.sub

    if (!userId) {
      throw new Error("User not authenticated")
    }

    // Find the subscription to ensure it belongs to the user
    const subscription = await prisma.pushSubscription.findFirst({
      where: {
        id,
        tenantId: code,
        userId,
      },
    })

    if (!subscription) {
      res.status(404).json({
        errors: [{
          status: '404',
          title: 'Not Found',
          detail: 'Subscription not found or does not belong to this user'
        }]
      })
      return
    }

    // Delete the subscription
    await prisma.pushSubscription.delete({
      where: { id },
    })

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
