import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Web storefront buyers (built-in email + password auth, separate from gw_users)
export const smmpUsers = pgTable("smmp_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  // Wallet balance in NGN. Buyers deposit here; orders are debited from it.
  balance: numeric("balance", { precision: 14, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Orders placed by buyers and forwarded to the SMM provider
export const smmpOrders = pgTable(
  "smmp_orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => smmpUsers.id, { onDelete: "cascade" }),
    providerOrderId: text("provider_order_id"),
    service: text("service").notNull(),
    serviceName: text("service_name").notNull(),
    link: text("link").notNull(),
    quantity: integer("quantity").notNull(),
    // What the buyer was charged (marked-up price), in NGN
    charge: numeric("charge", { precision: 14, scale: 4 }).notNull(),
    status: text("status").notNull().default("pending"),
    // pending | processing | completed | partial | canceled | failed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("smmp_orders_user_idx").on(t.userId, t.createdAt)],
);

// Wallet ledger: deposits (+), order spends (-), refunds (+)
export const smmpTransactions = pgTable(
  "smmp_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => smmpUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // deposit | order | refund
    // Signed NGN amount: positive credits, negative debits
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 4 }).notNull(),
    status: text("status").notNull().default("success"), // pending | success | failed
    // External reference (e.g. Flutterwave tx_ref). Unique so deposits credit once.
    reference: text("reference"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres treats NULLs as distinct, so non-deposit rows (null ref) are unaffected.
    uniqueIndex("smmp_txn_reference_idx").on(t.reference),
    index("smmp_txn_user_idx").on(t.userId, t.createdAt),
  ],
);

export type SmmpUser = typeof smmpUsers.$inferSelect;
export type SmmpOrder = typeof smmpOrders.$inferSelect;
export type SmmpTransaction = typeof smmpTransactions.$inferSelect;
