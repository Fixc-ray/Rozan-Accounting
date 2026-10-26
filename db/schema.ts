import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  company: text("company"),
  phone: text("phone"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const availabilityRules = sqliteTable("availability_rules", {
  weekday: integer("weekday").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  startTime: text("start_time").notNull().default("09:00"),
  endTime: text("end_time").notNull().default("17:00"),
  slotMinutes: integer("slot_minutes").notNull().default(30),
  updatedAt: integer("updated_at").notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"),
  type: text("type").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  service: text("service"),
  preferredDate: text("preferred_date"),
  preferredTime: text("preferred_time"),
  consultationType: text("consultation_type"),
  details: text("details"),
  status: text("status").notNull().default("new"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_submissions_type").on(table.type),
  index("idx_submissions_status").on(table.status),
  index("idx_submissions_owner").on(table.ownerId),
  index("idx_submissions_owner_created").on(table.ownerId, table.createdAt),
  index("idx_submissions_booking").on(table.preferredDate, table.preferredTime),
]);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  category: text("category").notNull().default("Other"),
  status: text("status").notNull().default("received"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_documents_owner").on(table.ownerId),
  index("idx_documents_owner_created").on(table.ownerId, table.createdAt),
]);

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  service: text("service").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_invoices_client").on(table.clientId),
  index("idx_invoices_client_created").on(table.clientId, table.createdAt),
]);
