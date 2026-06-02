import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Dashboard users (built-in email + password auth)
export const gwUsers = pgTable("gw_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Gateway phones running the SMS Gateway for Android app (capcom6 / sms-gate.app)
export const gwDevices = pgTable(
  "gw_devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => gwUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phoneNumber: text("phone_number"),
    smsgateBaseUrl: text("smsgate_base_url")
      .notNull()
      .default("https://api.sms-gate.app/3rdparty/v1"),
    smsgateLogin: text("smsgate_login"),
    smsgatePassword: text("smsgate_password"),
    // Unguessable token embedded in the inbound webhook URL for this device
    webhookToken: text("webhook_token").notNull().unique(),
    // Optional HMAC secret configured in the app's webhook settings
    webhookSecret: text("webhook_secret"),
    status: text("status").notNull().default("unknown"), // unknown | online | offline
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gw_devices_user_idx").on(t.userId)],
);

export const gwContacts = pgTable(
  "gw_contacts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => gwUsers.id, { onDelete: "cascade" }),
    name: text("name"),
    phoneNumber: text("phone_number").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("gw_contacts_user_phone_idx").on(t.userId, t.phoneNumber)],
);

export const gwThreads = pgTable(
  "gw_threads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => gwUsers.id, { onDelete: "cascade" }),
    contactPhone: text("contact_phone").notNull(),
    contactName: text("contact_name"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    lastDirection: text("last_direction"), // inbound | outbound
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gw_threads_user_contact_idx").on(t.userId, t.contactPhone),
    index("gw_threads_user_last_idx").on(t.userId, t.lastMessageAt),
  ],
);

export const gwBatches = pgTable("gw_batches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => gwUsers.id, { onDelete: "cascade" }),
  name: text("name"),
  bodyTemplate: text("body_template").notNull(),
  total: integer("total").notNull().default(0),
  sent: integer("sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  status: text("status").notNull().default("running"), // running | done | failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gwMessages = pgTable(
  "gw_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => gwUsers.id, { onDelete: "cascade" }),
    threadId: integer("thread_id")
      .notNull()
      .references(() => gwThreads.id, { onDelete: "cascade" }),
    deviceId: integer("device_id").references(() => gwDevices.id, {
      onDelete: "set null",
    }),
    batchId: integer("batch_id").references(() => gwBatches.id, {
      onDelete: "set null",
    }),
    direction: text("direction").notNull(), // inbound | outbound
    peerPhone: text("peer_phone").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("queued"),
    // queued | sent | delivered | failed | received
    error: text("error"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [
    index("gw_messages_thread_idx").on(t.threadId, t.createdAt),
    index("gw_messages_user_idx").on(t.userId, t.createdAt),
    index("gw_messages_provider_idx").on(t.providerMessageId),
  ],
);

export const insertGwContactSchema = createInsertSchema(gwContacts).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type GwUser = typeof gwUsers.$inferSelect;
export type GwDevice = typeof gwDevices.$inferSelect;
export type GwContact = typeof gwContacts.$inferSelect;
export type GwThread = typeof gwThreads.$inferSelect;
export type GwBatch = typeof gwBatches.$inferSelect;
export type GwMessage = typeof gwMessages.$inferSelect;
export type InsertGwContact = z.infer<typeof insertGwContactSchema>;
