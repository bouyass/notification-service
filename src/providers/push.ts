import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(process.env.FCM_SERVICE_ACCOUNT_FILE!),
  });
}
export const fcmProvider = admin.messaging();