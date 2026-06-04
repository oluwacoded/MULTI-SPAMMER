# SMS Gateway — Setup & Deployment

This dashboard sends and receives real SMS through **your own Android phone** using
the open-source **SMS Gateway for Android** app (capcom6 / https://sms-gate.app).
The phone is the modem; this app is the web control panel that talks to it.

It runs in **Cloud mode**, so your phone and this dashboard do not need to be on the
same network — the phone connects out to the SMS Gateway cloud relay, and this
backend calls that relay's REST API to send. Inbound SMS and delivery receipts are
pushed back to this app via a webhook.

---

## 1. Install the Android app

1. On the phone whose number you want to use (your eSIM number), install
   **"SMS Gateway for Android"** from the project site: https://sms-gate.app
   (Play Store / GitHub releases / F-Droid).
2. Open the app and grant the SMS send/receive permissions it asks for.
3. Enable **Cloud server** mode (sometimes labelled "Cloud" / "Public server").
4. The app shows a **username** and **password** for the cloud server. Keep this
   screen handy — you paste these two values into this dashboard in step 3.
5. Leave the app running. Disable battery optimization for it so Android does not
   kill it in the background.

> Self-hosted/local-server mode also works: just point the device's
> "Gateway base URL" at your own server instead of the default cloud URL.

---

## 2. Create your dashboard account

1. Open this app and go to **Register**. Create an account with email + password
   (minimum 8 characters). Auth is built-in (JWT) — credentials are stored hashed
   (scrypt) in the database.
2. Log in.

---

## 3. Add your phone as a device

1. Go to **Settings**.
2. Click **Add device** and fill in:
   - **Name** — anything, e.g. "My eSIM".
   - **Phone number** — optional, the number on the SIM (for your reference).
   - **Gateway login / password** — the **username and password** from the Android
     app's Cloud server screen (step 1.4).
   - **Gateway base URL** — leave as default (`https://api.sms-gate.app/3rdparty/v1`)
     for Cloud mode, or your own URL for self-hosted.
   - **Webhook secret** — optional but recommended (see step 4).
3. Save, then click **Test connection**. A green/online result means the backend can
   reach your phone through the cloud relay. You can now send SMS.

The gateway password is write-only from the dashboard's perspective: it is never
returned in API responses.

---

## 4. Enable inbound SMS + delivery receipts (webhook)

So that incoming texts and delivery statuses appear in your conversations:

1. In **Settings**, each device shows a **Webhook URL** and **Webhook token**
   (copy buttons provided). The URL looks like:

   ```
   https://<your-app-domain>/api/gateway/webhook/<token>
   ```

   In development the domain is your Replit dev URL; in production it is your
   deployed `.replit.app` (or custom) domain.

2. In the Android app's **Webhooks** settings, add a webhook pointing at that URL
   and subscribe to the events: `sms:received`, `sms:sent`, `sms:delivered`,
   `sms:failed`.

3. **(Recommended)** If you set a **Webhook secret** on the device, set the same
   secret in the Android app's webhook signing settings. The backend verifies the
   `X-Signature` / `X-Hub-Signature-256` HMAC and rejects forged requests. Without a
   secret, the unguessable token in the URL is the only protection — fine for testing,
   but set a secret for production.

The webhook token is unguessable and per-device; rotate it by deleting and
re-adding the device if it ever leaks.

---

## 5. Day-to-day use

- **Conversations** — threaded view of every number you talk to; reply inline.
- **Compose** — send a single message, or a batch (paste recipients or pick
  contacts). Batches support a `{name}` token and run server-side with live progress.
- **Contacts** — your address book; used by batch sends.
- **Search** — full-text search across all message bodies.
- Inbound messages, delivery status changes, and batch progress refresh
  automatically (the dashboard polls every few seconds).

---

## Deployment

- Publish the project from Replit. The **API Server** and this **SMS Gateway**
  dashboard are separate artifacts in the same monorepo and are served behind the
  same domain (`/api` for the backend, `/sms-dashboard/` for this UI).
- Required environment variables:
  - `DATABASE_URL` — PostgreSQL (provisioned automatically by Replit).
  - `GW_JWT_SECRET` — secret used to sign dashboard auth tokens. Already set in
    development; ensure it is present in the deployment's secrets.
- After deploying, update each device's webhook in the Android app to use the
  **production** domain (step 4), since the dev URL will differ.
- The database schema is managed through Replit's Publish flow (dev schema is
  diffed and applied to production on publish) — no manual migration scripts.

---

## Security notes

- Passwords are hashed with scrypt; auth tokens are HMAC-signed (HS256) and expire.
- Auth endpoints are rate-limited.
- Device gateway passwords and webhook secrets are never exposed via the API.
- Inbound webhooks are protected by an unguessable per-device token and optional
  HMAC signature verification.
