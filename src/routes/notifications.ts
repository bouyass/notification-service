import { Router, Response } from "express";
import { PrismaClient, Device } from "@prisma/client";
import { auth, AuthRequest } from "../middlewares/auth";
import { fcmProvider } from "../providers/push";

const prisma = new PrismaClient();
const router = Router();

/**
 * 📌 Create & send (or schedule) a notification
 */
router.post("/", auth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, body, data, scheduleAt, topicId, userIds } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: "title and body are required" });
    }
    if (!topicId && (!userIds || userIds.length === 0)) {
      return res.status(400).json({ error: "Provide either topicId or userIds" });
    }

    // Validate topic ownership
    if (topicId) {
      const topic = await prisma.topic.findFirst({
        where: { id: topicId, appId: req.appId },
      });
      if (!topic) return res.status(404).json({ error: "Topic not found" });
    }

    // Create notification record
    const notif = await prisma.notification.create({
      data: {
        appId: req.appId!,
        title,
        body,
        data,
        scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
        status: scheduleAt ? "pending" : "processing",
        topicId,
      },
    });

    // Handle scheduling (MVP: just store as pending)
    if (scheduleAt) {
      return res.status(201).json({ status: "scheduled", id: notif.id });
    }

    // Collect devices
    let devices: Device[] = [];
    if (topicId) {
      // ✅ user-based subscriptions
      const subs = await prisma.notificationSubscription.findMany({
        where: { topicId },
        include: { user: { include: { devices: true } } },
      });
      devices = subs
        .flatMap((s) => s.user.devices)
        .filter((d) => d.isActive);
    } else if (userIds) {
      devices = await prisma.device.findMany({
        where: {
          appId: req.appId!,
          userId: { in: userIds },
          isActive: true,
        },
      });
    }

    if (devices.length === 0) {
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: "no_targets" },
      });
      return res.status(200).json({ status: "no_targets", id: notif.id });
    }

    // Send immediately
    await sendPushBatch(devices, { title, body, data }, notif.id);

    await prisma.notification.update({
      where: { id: notif.id },
      data: { status: "sent" },
    });

    return res.status(201).json({ status: "sent", id: notif.id });
  } catch (err: any) {
    console.error("Notification error", err);
    return res.status(500).json({ error: "Failed to create notification" });
  }
});

/**
 * 📌 List notifications
 */
router.get("/", auth, async (req: AuthRequest, res: Response) => {
  const notifs = await prisma.notification.findMany({
    where: { appId: req.appId },
    orderBy: { createdAt: "desc" },
  });
  res.json(notifs);
});

/**
 * 📌 Get notification + deliveries
 */
router.get("/:id", auth, async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findFirst({
    where: { id: req.params.id, appId: req.appId },
    include: { deliveries: true },
  });
  if (!notif) return res.status(404).json({ error: "Not found" });
  res.json(notif);
});

/**
 * 📌 Cancel scheduled notification
 */
router.post("/:id/cancel", auth, async (req: AuthRequest, res: Response) => {
  const notif = await prisma.notification.findFirst({
    where: { id: req.params.id, appId: req.appId },
  });
  if (!notif) return res.status(404).json({ error: "Not found" });
  if (notif.status !== "pending") {
    return res.status(400).json({ error: "Only pending notifications can be cancelled" });
  }

  await prisma.notification.update({
    where: { id: notif.id },
    data: { status: "cancelled" },
  });
  res.status(200).json({ status: "cancelled", id: notif.id });
});

export default router;

/**
 * 📌 Push sending logic
 */
export async function sendPushBatch(
  devices: Device[],
  payload: { title: string; body: string; data?: any },
  notificationId: string
) {
  const androidDevices = devices.filter((d) => d.provider === "fcm");

  if (androidDevices.length > 0) {
    const tokens = androidDevices.map((d) => d.pushToken);

    try {
      const response = await fcmProvider.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data || {},
      });

      await Promise.all(
        androidDevices.map((device, idx) =>
          prisma.delivery.create({
            data: {
              notificationId,
              deviceId: device.id,
              status: response.responses[idx].success ? "success" : "failed",
              lastError: response.responses[idx].error?.message || null,
              providerMessageId: (response.responses[idx] as any)?.messageId ?? null,
            },
          })
        )
      );
    } catch (err: any) {
      for (const device of androidDevices) {
        await prisma.delivery.create({
          data: {
            notificationId,
            deviceId: device.id,
            status: "failed",
            lastError: err.message,
          },
        });
      }
    }
  }
}
