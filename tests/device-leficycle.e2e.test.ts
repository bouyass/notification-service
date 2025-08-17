import request from "supertest";
import { server } from "../src/server";
import { prisma } from "../src/prisma";

describe("Notifications Service - Device Lifecycle", () => {
  let userId: string;
  let deviceId: string;

  jest.setTimeout(20000); // 20s

  // Utility: auth header with mocked JWT (issuer service normally provides this)
  const authHeader = { Authorization: "Bearer test-token" };

  beforeAll(async () => {
    await prisma.delivery.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationSubscription.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
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

  it("should register a device", async () => {
    const res = await request(server)
      .post("/v1/devices")
      .set(authHeader)
      .send({
        externalUserId: "user_1",
        platform: "ios",
        provider: "apns",
        pushToken: "tok_123",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    deviceId = res.body.id;
    userId = res.body.userId;
  });

  it("should update existing device on re-register", async () => {
    const res = await request(server)
      .post("/v1/devices")
      .set(authHeader)
      .send({
        externalUserId: "user_1",
        platform: "ios",
        provider: "apns",
        pushToken: "tok_123", // same token → should update
      });

    expect(res.status).toBe(201);
    expect(res.body.lastSeenAt).toBeDefined();
  });

  it("should delete device and cascade delete user if last device", async () => {
  const res = await request(server)
    .delete(`/v1/devices/${deviceId}`)
    .set(authHeader)
    .send();

  expect(res.status).toBe(204);

  // Ensure device is gone
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  expect(device).toBeNull();

  // Ensure user is gone too
  const user = await prisma.user.findUnique({ where: { id: userId } });
  expect(user).toBeNull();
});
});
