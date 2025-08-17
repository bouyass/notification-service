import request from "supertest";
import { server } from "../src/server";
import { prisma } from "../src/prisma";
import * as notifModule from "../src/routes/notifications";

describe("Notifications Service - Notification Flow", () => {
  let topicId: string;
  let userId: string;
  let deviceId: string;
  let notificationId: string;

  jest.setTimeout(20000); // 20s

  const authHeader = { Authorization: "Bearer test-token" };

  beforeAll(async () => {
    await prisma.delivery.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationSubscription.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
    
    // Mock sendPushBatch to avoid APNs/FCM calls
    jest.spyOn(notifModule, "sendPushBatch").mockImplementation(
      async (devices, payload, notifId) => {
        await prisma.delivery.createMany({
          data: devices.map((d) => ({
            payload,
            notificationId: notifId,
            deviceId: d.id,
            status: "success",
            providerMessageId: "mock-msg-id",
          })),
        });
       return
      }
    );

    // 1. Create user
    const user = await prisma.user.create({
      data: { appId: "app_a", externalId: "user_1" },
    });
    userId = user.id;

    // 2. Register device
    const device = await prisma.device.create({
      data: {
        appId: "app_a",
        userId: user.id,
        platform: "android",
        provider: "fcm",
        pushToken: "tok_123",
      },
    });
    deviceId = device.id;

    // 3. Create topic
    const topic = await prisma.topic.create({
      data: { appId: "app_a", key: "artist-drake", name: "Drake" },
    });
    topicId = topic.id;

    // 4. Subscribe user
    await prisma.notificationSubscription.create({
      data: { topicId: topic.id, userId: user.id },
    });
  });

  afterAll(async () => {
    await prisma.delivery.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationSubscription.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    server.close();
  });

  it("should send a notification to a topic", async () => {
    const res = await request(server)
      .post("/v1/notifications")
      .set(authHeader)
      .send({
        topicId,
        title: "New Drake Album!",
        body: "Listen now 🎧",
        data: { releaseId: "rel_1" },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("sent");

    notificationId = res.body.id;
  });

  it("should persist the notification in DB", async () => {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    expect(notif).not.toBeNull();
    expect(notif?.title).toBe("New Drake Album!");
    expect(notif?.status).toBe("sent");
  });

  it("should create a delivery for subscribed device", async () => {
    const deliveries = await prisma.delivery.findMany({
      where: { notificationId },
    });

    expect(deliveries.length).toBe(1);
    expect(deliveries[0].deviceId).toBe(deviceId);
    expect(["success", "failed"]).toContain(deliveries[0].status);
  });

  it("should retrieve a notification with deliveries", async () => {
    const res = await request(server)
      .get(`/v1/notifications/${notificationId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.deliveries.length).toBe(1);
    expect(res.body.deliveries[0].deviceId).toBe(deviceId);
  });
});
