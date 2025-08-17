import request from "supertest";
import { server } from "../src/server";
import { prisma } from "../src/prisma";

describe("Notifications Service - Topics & Subscriptions", () => {
  let topicId: string;
  let userId: string;
  let deviceId: string;

  jest.setTimeout(20000); // 20s
  
  const authHeader = { Authorization: "Bearer test-token" };

  beforeAll(async () => {
    await prisma.delivery.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationSubscription.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();

    // Create a user with one device (so we can subscribe it later)
    const user = await prisma.user.create({
      data: { appId: "app_a", externalId: "user_1" },
    });
    userId = user.id;

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

  it("should create a topic", async () => {
    const res = await request(server)
      .post("/v1/topics")
      .set(authHeader)
      .send({ key: "artist-drake", name: "Drake" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.key).toBe("artist-drake");
    topicId = res.body.id;
  });

  it("should subscribe user to topic", async () => {
    const res = await request(server)
      .post(`/v1/subscriptions/${topicId}/subscribe`)
      .set(authHeader)
      .send({ userId });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(userId);
    expect(res.body.topicId).toBe(topicId);

    // Check DB
    const subs = await prisma.notificationSubscription.findMany({ where: { topicId } });
    expect(subs.length).toBe(1);
    expect(subs[0].userId).toBe(userId);
  });

  it("should unsubscribe user from topic", async () => {
    const res = await request(server)
      .delete(`/v1/subscriptions/${topicId}/unsubscribe`)
      .set(authHeader)
      .send({ userId });

    expect(res.status).toBe(200);

    // Check DB
    const subs = await prisma.notificationSubscription.findMany({ where: { topicId } });
    expect(subs.length).toBe(0);
  });

  it("should delete a topic (cascade)", async () => {
    const res = await request(server)
      .delete(`/v1/topics/${topicId}`)
      .set(authHeader);

    expect(res.status).toBe(204);

    // Check DB
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    expect(topic).toBeNull();
  });
});
