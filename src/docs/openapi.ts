// src/docs/openapi.ts
export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Notifications Service API",
    version: "1.0.0",
    description:
      "API to register push devices and send notifications (immediate or scheduled). Secured with JWTs signed by the Issuer service."
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "Devices", description: "Manage push devices" },
    { name: "Notifications", description: "Send notifications" }
  ],
  security: [{ BearerAuth: [] }],
  paths: {
    "/v1/devices": {
      post: {
        tags: ["Devices"],
        summary: "Register or update a device",
        operationId: "registerDevice",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterDeviceRequest" },
              examples: {
                expo_ios: {
                  value: {
                    platform: "ios",
                    provider: "expo",
                    pushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Device created or updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Device" }
              }
            }
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/ServerError" }
        }
      }
    },
    "/v1/notifications": {
      post: {
        tags: ["Notifications"],
        summary: "Send a notification now or schedule it",
        operationId: "sendNotification",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SendNotificationRequest" },
              examples: {
                immediate_to_users: {
                  value: {
                    userIds: ["user_123", "user_987"],
                    title: "Welcome",
                    body: "Thanks for joining!",
                    data: { screen: "home" }
                  }
                },
                scheduled_broadcast: {
                  value: {
                    title: "Promo",
                    body: "-20% this weekend",
                    scheduleAt: "2025-08-16T10:00:00Z"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Dispatch result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotificationDispatchResponse" },
                examples: {
                  scheduled: { value: { status: "scheduled" } },
                  sent: { value: { status: "sent" } }
                }
              }
            }
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "500": { $ref: "#/components/responses/ServerError" }
        }
      }
    },
    "/openapi.json": {
      get: {
        summary: "OpenAPI document",
        responses: { "200": { description: "OpenAPI JSON" } }
      }
    },
    "/docs": {
      get: {
        summary: "Swagger UI",
        responses: { "200": { description: "Swagger UI HTML" } }
      }
    }
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
    },
    responses: {
      BadRequest: {
        description: "Invalid input",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: { bad_request: { value: { error: "bad_request", message: "Invalid payload" } } }
          }
        }
      },
      Unauthorized: {
        description: "Missing or invalid JWT",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: { unauthorized: { value: { error: "missing_token" } } }
          }
        }
      },
      ServerError: {
        description: "Unexpected server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: { server_error: { value: { error: "server_error" } } }
          }
        }
      }
    },
    schemas: {
      RegisterDeviceRequest: {
        type: "object",
        properties: {
          platform: { type: "string", example: "ios", description: "Client platform (ios|android|web...)" },
          provider: { type: "string", example: "expo", description: "Push provider (expo, fcm...)" },
          pushToken: { type: "string", description: "Push token from the provider" }
        },
        required: ["platform", "provider", "pushToken"]
      },
      Device: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          appId: { type: "string" },
          userId: { type: "string" },
          platform: { type: "string" },
          provider: { type: "string" },
          pushToken: { type: "string" },
          lastSeenAt: { type: "string", format: "date-time" },
          isActive: { type: "boolean" }
        },
        required: ["id", "appId", "userId", "platform", "provider", "pushToken", "lastSeenAt", "isActive"]
      },
      SendNotificationRequest: {
        type: "object",
        properties: {
          userIds: {
            type: "array",
            items: { type: "string" },
            description: "Target specific users (optional). If omitted, all active devices for appId are targeted."
          },
          title: { type: "string" },
          body: { type: "string" },
          data: { type: "object", additionalProperties: true },
          scheduleAt: {
            type: "string",
            format: "date-time",
            description: "ISO date-time to schedule; if omitted, sends immediately."
          }
        },
        required: ["title", "body"]
      },
      NotificationDispatchResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["scheduled", "sent"] }
        },
        required: ["status"]
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" }
        },
        required: ["error"]
      }
    }
  }
} as const;
