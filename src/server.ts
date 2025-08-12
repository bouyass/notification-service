import express, { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { PrismaClient, Device, Notification } from "@prisma/client";
import axios from "axios";
import cron from "node-cron";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

interface AuthRequest extends Request {
  tenantId?: string;
  appId?: string;
  userId?: string;
}

interface DecodedToken extends JwtPayload {
  tenant_id: string;
  app_id: string;
  sub: string;
}

// Middleware Auth multi-tenant
function auth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req?.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as DecodedToken;

    req.tenantId = decoded.tenant_id;
    req.appId = decoded.app_id;
    req.userId = decoded.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// 📌 Enregistrer un device
app.post("/v1/devices", auth, async (req: AuthRequest, res: Response) => {
  const { platform, provider, pushToken } = req.body as {
    platform: string;
    provider: string;
    pushToken: string;
  };

  let device = await prisma.device.findFirst({
    where: { pushToken, appId: req.appId }
  });

  if (!device) {
    device = await prisma.device.create({
      data: {
        platform,
        provider,
        pushToken,
        appId: req.appId!,
        userId: req.userId!
      }
    });
  } else {
    device = await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), isActive: true }
    });
  }

  res.json(device);
});

// 📌 Envoyer une notif immédiate
app.post("/v1/notifications", auth, async (req: AuthRequest, res: Response) => {
  const { userIds, title, body, data, scheduleAt } = req.body as {
    userIds?: string[];
    title: string;
    body: string;
    data?: Record<string, any>;
    scheduleAt?: string;
  };

  const devices = await prisma.device.findMany({
    where: {
      appId: req.appId,
      isActive: true,
      ...(userIds ? { userId: { in: userIds } } : {})
    }
  });

  const notif = await prisma.notification.create({
    data: {
      appId: req.appId!,
      title,
      body,
      data,
      scheduleAt: scheduleAt ? new Date(scheduleAt) : null,
      status: scheduleAt ? "pending" : "sent"
    }
  });

  // Si programmation → laisser le cron job s'en charger
  if (scheduleAt) return res.json({ status: "scheduled" });

  await sendPushBatch(devices, { title, body, data }, notif.id);
  res.json({ status: "sent" });
});

// 📌 Fonction d’envoi via Expo Push
async function sendPushBatch(
  devices: Device[],
  payload: { title: string; body: string; data?: Record<string, any> },
  notificationId: string
) {
  const messages = devices.map((d) => ({
    to: d.pushToken,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: "default",
    priority: "high"
  }));

  try {
    const res = await axios.post(
      "https://exp.host/--/api/v2/push/send",
      messages,
      { headers: { "Content-Type": "application/json" } }
    );

    const tickets = res.data.data;

    for (let i = 0; i < devices.length; i++) {
      await prisma.delivery.create({
        data: {
          notificationId,
          deviceId: devices[i].id,
          status: tickets[i]?.status || "error",
          providerMessageId: tickets[i]?.id || null
        }
      });
    }
  } catch (err: any) {
    console.error("Push send error", err.response?.data || err.message);
  }
}

// ⏰ Cron pour envois programmés
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const notifs: Notification[] = await prisma.notification.findMany({
    where: { scheduleAt: { lte: now }, status: "pending" }
  });

  for (const notif of notifs) {
    const devices = await prisma.device.findMany({
      where: { appId: notif.appId, isActive: true }
    });
    await sendPushBatch(devices, notif, notif.id);
    await prisma.notification.update({
      where: { id: notif.id },
      data: { status: "sent" }
    });
  }
});

app.listen(3000, () =>
  console.log("🚀 Notification service running on :3000")
);
