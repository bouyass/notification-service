import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { auth, AuthRequest } from "../middlewares/auth";

const prisma = new PrismaClient();
const router = Router();

/**
 * 📌 Register or update a device
 */
router.post("/", auth, async (req: AuthRequest, res: Response) => {
  const { platform, provider, pushToken, externalUserId } = req.body;

  if (!platform || !provider || !pushToken || !externalUserId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // 1. Find or create user (scoped to appId)
  let user = await prisma.user.findFirst({
    where: { appId: req.appId, externalId: externalUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { appId: req.appId!, externalId: externalUserId },
    });
  }

  // 2. Find device by pushToken + appId
  let device = await prisma.device.findFirst({
    where: { pushToken, appId: req.appId },
  });

  if (!device) {
    // new device
    device = await prisma.device.create({
      data: {
        platform,
        provider,
        pushToken,
        appId: req.appId!,
        userId: user.id,
      },
    });
  } else {
    // update existing device
    device = await prisma.device.update({
      where: { id: device.id },
      data: { 
        lastSeenAt: new Date(),
        isActive: true,
        userId: user.id // ensure it’s linked to the right user
      },
    });
  }

  res.status(201).json(device);
});

/**
 * 📌 List devices
 */
router.get("/", auth, async (req: AuthRequest, res: Response) => {
  const { platform, externalUserId } = req.query;

  const devices = await prisma.device.findMany({
    where: {
      appId: req.appId,
      platform: platform ? String(platform) : undefined,
      user: externalUserId ? { externalId: String(externalUserId) } : undefined,
    },
    include: { user: true },
  });

  res.json(devices);
});

/**
 * 📌 Deactivate a device
 */
/**
 * 📌 Delete a device (and its user if no devices remain)
 */
router.delete("/:id", auth, async (req: AuthRequest, res: Response) => {

  const device = await prisma.device.findFirst({
    where: { id: req.params.id, appId: req.appId },
    include: { user: true },
  });

    const userId = device?.userId

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  // Delete the device first
  await prisma.device.delete({ where: { id: device.id } });

  // Check if the user has any devices left
  const remainingDevices = await prisma.device.count({
    where: { userId: device.userId },
  });

  if (remainingDevices === 0) {
    await prisma.user.delete({ where: { id: userId } });
  }

  res.status(204).send();
});

export default router;
