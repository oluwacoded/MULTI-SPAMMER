import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  Batch,
  BatchInput,
  Contact,
  ContactInput,
  ConnectionTestResult,
  Device,
  DeviceInput,
  Message,
  Overview,
  SearchResult,
  SendInput,
  Thread,
} from "./types";

const LIVE_REFETCH = 4000;

// ---------- query keys ----------
export const qk = {
  overview: ["overview"] as const,
  devices: ["devices"] as const,
  contacts: (query?: string) => ["contacts", query ?? ""] as const,
  threads: ["threads"] as const,
  messages: (threadId: number) => ["messages", threadId] as const,
  batches: ["batches"] as const,
  search: (q: string) => ["search", q] as const,
};

// ---------- overview ----------
export function useOverview() {
  return useQuery({
    queryKey: qk.overview,
    queryFn: () => api.get<Overview>("/overview"),
    refetchInterval: LIVE_REFETCH,
  });
}

// ---------- devices ----------
export function useDevices() {
  return useQuery({
    queryKey: qk.devices,
    queryFn: () => api.get<Device[]>("/devices"),
  });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceInput) => api.post<Device>("/devices", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.devices });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<DeviceInput> }) =>
      api.patch<Device>(`/devices/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.devices });
    },
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: boolean }>(`/devices/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.devices });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useTestDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ConnectionTestResult>(`/devices/${id}/test`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.devices });
    },
  });
}

// ---------- contacts ----------
export function useContacts(query?: string) {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return useQuery({
    queryKey: qk.contacts(query),
    queryFn: () => api.get<Contact[]>(`/contacts${suffix}`),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput) => api.post<Contact>("/contacts", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<ContactInput> }) =>
      api.patch<Contact>(`/contacts/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: boolean }>(`/contacts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

// ---------- threads + messages ----------
export function useThreads() {
  return useQuery({
    queryKey: qk.threads,
    queryFn: () => api.get<Thread[]>("/threads"),
    refetchInterval: LIVE_REFETCH,
  });
}

export function useMessages(threadId: number | null) {
  return useQuery({
    queryKey: qk.messages(threadId ?? 0),
    queryFn: () => api.get<Message[]>(`/threads/${threadId}/messages`),
    enabled: threadId != null,
    refetchInterval: LIVE_REFETCH,
  });
}

export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: number) =>
      api.post<{ ok: boolean }>(`/threads/${threadId}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.threads });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

// ---------- sending ----------
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendInput) => api.post<Message>("/send", input),
    onSuccess: (msg) => {
      void qc.invalidateQueries({ queryKey: qk.threads });
      void qc.invalidateQueries({ queryKey: qk.messages(msg.threadId) });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useSendBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BatchInput) => api.post<Batch>("/batch", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.batches });
      void qc.invalidateQueries({ queryKey: qk.threads });
      void qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useBatches() {
  return useQuery({
    queryKey: qk.batches,
    queryFn: () => api.get<Batch[]>("/batches"),
    refetchInterval: LIVE_REFETCH,
  });
}

// ---------- search ----------
export function useSearch(q: string) {
  return useQuery({
    queryKey: qk.search(q),
    queryFn: () => api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });
}
