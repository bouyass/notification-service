import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { auth, AuthRequest } from "../middlewares/auth";

const prisma = new PrismaClient();
const router = Router();

/**
 * 📌 Subscribe a user to a topic
 */
router.post("/:topicId/subscribe", auth, async (req: AuthRequest, res: Response) => {
  const { userId } = req.body;

  const sub = await prisma.notificationSubscription.create({
    data: {
      topicId: req.params.topicId,
      userId,
    },
  });

  res.status(201).json(sub);
});



/**
 * 📌 Unsubscribe a device from a topic
 */
router.delete("/:topicId/unsubscribe", auth, async (req: AuthRequest, res: Response) => {
  const { userId } = req.body;

  await prisma.notificationSubscription.deleteMany({
    where: { topicId: req.params.topicId, userId },
  });

  res.status(200).send();
});


/**
 * 📌 Delete a subscription
 */
router.delete("/v1/subscriptions/:id", auth, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  await prisma.notificationSubscription.delete({ where: { id } });

  res.status(204).send();
});

export default router;
