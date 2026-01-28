import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import prisma from "../../utils/prisma";
import { Prisma } from "@prisma/client";
import { badRequest, internalError, notFound } from "../../utils/error";
import { serializePushNotification } from "./push.serialize";

const pushNotificationSchema = z.object({
  data: z.object({
    type: z.literal("push-notifications").optional(),
    id: z.string().uuid().optional(),
    attributes: z.object({
      dismissed: z.coerce.boolean().optional(),
      delivered: z.coerce.boolean().optional(),
      clicked: z.coerce.boolean().optional(),
      clickaction: z.string().min(1).max(32).optional()
    }),
  }),
});

export const updatePushNotification = async (req: Request, res: Response, next: NextFunction) => {
    const { code, id } = req.params;

    let validatedData: z.infer<typeof pushNotificationSchema>;

    try {
      validatedData = pushNotificationSchema.parse(req.body);
    } catch (err) {
      throw badRequest("Invalid request body", { cause: err });
    }

    if (validatedData.data.id !== undefined && validatedData.data.id !== id) {
      throw badRequest("Resource ID in body does not match ID in URL");
    }

    const { delivered, dismissed, clicked, clickaction } = validatedData.data.attributes;

    const data: any = {};
    if (delivered === true) {
      data.deliveredAt = new Date();
    }
    if (dismissed === true) {
      data.dismissedAt = new Date();
    }
    if (clicked === true) {
      data.clickedAt = new Date();
    }
    if (clickaction !== undefined) {
      data.clickedAction = clickaction;
    }

    // Update the push notification
    let pushNotification;
    try {
      pushNotification = await prisma.pushNotification.update({
        where: {
          id: id,
          tenantId: code,
        },
        data,
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw notFound("Push notification not found");
      }
      if (err.message && err.message.includes("Record not found")) {
        throw notFound("Push notification not found");
      }
      throw internalError("Failed to update push notification", { cause: err });
    }

    const response = {
      data: serializePushNotification(pushNotification),
    };

    res.json(response);
}