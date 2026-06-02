export interface GwUser {
  id: number;
  email: string;
  name: string | null;
}

export interface AuthResponse {
  token: string;
  user: GwUser;
}

export interface Device {
  id: number;
  userId: number;
  name: string;
  phoneNumber: string | null;
  smsgateBaseUrl: string;
  smsgateLogin: string | null;
  webhookToken: string;
  status: string; // unknown | online | offline
  lastSeenAt: string | null;
  createdAt: string;
  hasCredentials: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
}

export interface Contact {
  id: number;
  userId: number;
  name: string | null;
  phoneNumber: string;
  notes: string | null;
  createdAt: string;
}

export interface Thread {
  id: number;
  userId: number;
  contactPhone: string;
  contactName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastDirection: "inbound" | "outbound" | null;
  unreadCount: number;
  createdAt: string;
}

export interface Message {
  id: number;
  userId: number;
  threadId: number;
  deviceId: number | null;
  batchId: number | null;
  direction: "inbound" | "outbound";
  peerPhone: string;
  body: string;
  status: string; // queued | sent | delivered | failed | received
  error: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

export interface Batch {
  id: number;
  userId: number;
  name: string | null;
  bodyTemplate: string;
  total: number;
  sent: number;
  failed: number;
  status: string; // running | done | failed
  createdAt: string;
}

export interface Overview {
  threads: number;
  contacts: number;
  devices: number;
  unread: number;
  sent: number;
  received: number;
}

export interface SearchResult {
  id: number;
  threadId: number;
  direction: "inbound" | "outbound";
  peerPhone: string;
  body: string;
  status: string;
  createdAt: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message?: string;
}

export interface DeviceInput {
  name: string;
  phoneNumber?: string;
  smsgateBaseUrl?: string;
  smsgateLogin?: string;
  smsgatePassword?: string;
  webhookSecret?: string;
}

export interface ContactInput {
  name?: string;
  phoneNumber: string;
  notes?: string;
}

export interface SendInput {
  deviceId: number;
  to: string;
  body: string;
}

export interface BatchRecipientInput {
  phone: string;
  name?: string | null;
}

export interface BatchInput {
  deviceId: number;
  name?: string;
  body: string;
  recipients?: BatchRecipientInput[];
  contactIds?: number[];
}
