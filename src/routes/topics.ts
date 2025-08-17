import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { auth, AuthRequest } from "../middlewares/auth";

const prisma = new PrismaClient();
const router = Router();

/**
 * 📌 Create a topic
 */
router.post("/", auth, async (req: AuthRequest, res: Response) => {
  const { key, name } = req.body;

  if (!key || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Ensure topic is unique per app
  const existing = await prisma.topic.findFirst({
    where: { appId: req.appId, key },
  });

  if (existing) {
    return res.status(409).json({ error: "Topic already exists" });
  }

  const topic = await prisma.topic.create({
    data: { appId: req.appId!, key, name },
  });

  res.status(201).json(topic);
});

/**
 * 📌 List topics
 */
router.get("/", auth, async (req: AuthRequest, res: Response) => {
  const topics = await prisma.topic.findMany({
    where: { appId: req.appId },
    orderBy: { name: "asc" },
  });

  res.json(topics);
});

/**
 * 📌 Delete a topic
 * (removes subscriptions + notifications cascade if you want clean-up)
 */
router.delete("/:id", auth, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const topic = await prisma.topic.findFirst({
    where: { id, appId: req.appId },
  });

  if (!topic) {
    return res.status(404).json({ error: "Topic not found" });
  }

  // Cascade cleanup (optional — you may want to keep historical notifications)
  await prisma.notificationSubscription.deleteMany({ where: { topicId: id } });
  await prisma.notification.deleteMany({ where: { topicId: id } });

  await prisma.topic.delete({ where: { id } });

  res.status(204).send();
});

export default router;
