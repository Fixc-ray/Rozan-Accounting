import {
  addDoc, Bytes, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type DocumentData, type DocumentSnapshot, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth";
import { availabilitySlotId, availableSlotsForDate, isValidAvailabilityDate, isValidAvailabilityTime, weekdayForAvailabilityDate } from "@/lib/availability";
import { getFirebaseServices } from "./client";
import type { AvailabilityRule, CallSession, DocumentRow, Invoice, PortalData, Profile, Role, Submission, WebsiteVisit, WorkspaceUser } from "./types";

export const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const documentChunkBytes = 600 * 1024;
const maximumDocumentBytes = 10 * 1024 * 1024;

export async function getAvailableSlots(date: string) {
  if (!isValidAvailabilityDate(date)) throw new Error("Choose a valid consultation date.");
  const { db } = getFirebaseServices();
  const weekday = weekdayForAvailabilityDate(date);
  const ruleSnapshot = await getDoc(doc(db, "availability", String(weekday)));
  const rule = ruleSnapshot.exists() ? ruleSnapshot.data() as Partial<AvailabilityRule> : undefined;
  const candidates = availableSlotsForDate(date, rule);
  if (!candidates.length) return [];
  const locks = await Promise.all(candidates.map(async (time) => {
    const [current, legacy] = await Promise.all([
      getDoc(doc(db, "bookingDays", date, "slots", time)),
      getDoc(doc(db, "bookingSlots", availabilitySlotId(date, time))),
    ]);
    return current.exists() || legacy.exists();
  }));
  return candidates.filter((_, index) => !locks[index]);
}

export async function submitPublicInquiry(payload: Record<string, string>) {
  const type = payload.type?.trim();
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const details = payload.details?.trim() ?? "";
  if (!["consultation", "quote", "contact"].includes(type) || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (type !== "consultation" && details.length < 4)) {
    throw new Error("Please complete the required inquiry details.");
  }

  const { db } = getFirebaseServices();
  const inquiryRef = doc(collection(db, "inquiries"));
  const record = {
    type,
    name: name.slice(0, 100),
    email: email.slice(0, 200),
    phone: (payload.phone ?? "").trim().slice(0, 40),
    company: (payload.company ?? "").trim().slice(0, 160),
    service: (payload.service ?? "").trim().slice(0, 160),
    preferredDate: (payload.preferredDate ?? "").trim().slice(0, 10),
    preferredTime: (payload.preferredTime ?? "").trim().slice(0, 5),
    consultationType: (payload.consultationType ?? "").trim().slice(0, 60),
    details: details.slice(0, 4000),
    status: "new",
    createdAt: serverTimestamp(),
  };

  if (type !== "consultation") {
    await setDoc(inquiryRef, record);
    return { ok: true, id: inquiryRef.id };
  }
  if (!record.service || !isValidAvailabilityDate(record.preferredDate) || !isValidAvailabilityTime(record.preferredTime)) {
    throw new Error("Choose a service and an available consultation time.");
  }

  const ruleRef = doc(db, "availability", String(weekdayForAvailabilityDate(record.preferredDate)));
  const lockRef = doc(db, "bookingDays", record.preferredDate, "slots", record.preferredTime);
  const legacyLockRef = doc(db, "bookingSlots", availabilitySlotId(record.preferredDate, record.preferredTime));
  await runTransaction(db, async (transaction) => {
    const ruleSnapshot = await transaction.get(ruleRef);
    const lockSnapshot = await transaction.get(lockRef);
    const legacyLockSnapshot = await transaction.get(legacyLockRef);
    const rule = ruleSnapshot.exists() ? ruleSnapshot.data() as Partial<AvailabilityRule> : undefined;
    if (lockSnapshot.exists() || legacyLockSnapshot.exists() || !availableSlotsForDate(record.preferredDate, rule).includes(record.preferredTime)) {
      throw new Error("That time is no longer available. Please choose another slot.");
    }
    transaction.set(inquiryRef, record);
    transaction.set(lockRef, {
      inquiryId: inquiryRef.id,
      preferredDate: record.preferredDate,
      preferredTime: record.preferredTime,
      status: "reserved",
      createdAt: serverTimestamp(),
    });
  });
  return { ok: true, id: inquiryRef.id };
}

export async function loadPortalData(role: Role, uid: string, section = "overview"): Promise<PortalData> {
  const { db } = getFirebaseServices();
  const admin = role === "admin";
  const needed = collectionsFor(role, section);
  const [inquiriesSnapshot, submissionsSnapshot, documentsSnapshot, invoicesSnapshot, profilesSnapshot, availabilitySnapshot, callsSnapshot, visitsSnapshot, viewsCountSnapshot, visitorsCountSnapshot] = await Promise.all([
    needed.has("inquiries") ? (admin ? getDocs(query(collection(db, "inquiries"), limit(250))) : getDocs(query(collection(db, "inquiries"), where("clientId", "==", uid), limit(100)))) : Promise.resolve(null),
    needed.has("submissions") ? (admin ? getDocs(query(collection(db, "submissions"), limit(250))) : getDocs(query(collection(db, "submissions"), where("ownerId", "==", uid), limit(100)))) : Promise.resolve(null),
    needed.has("documents") ? (admin ? getDocs(query(collection(db, "documents"), limit(250))) : getDocs(query(collection(db, "documents"), where("ownerId", "==", uid), limit(100)))) : Promise.resolve(null),
    needed.has("invoices") ? (admin ? getDocs(query(collection(db, "invoices"), limit(250))) : getDocs(query(collection(db, "invoices"), where("clientId", "==", uid), limit(100)))) : Promise.resolve(null),
    needed.has("profiles") && admin ? getDocs(query(collection(db, "users"), where("role", "==", "client"), limit(250))) : Promise.resolve(null),
    needed.has("availability") && admin ? getDocs(collection(db, "availability")) : Promise.resolve(null),
    needed.has("calls") ? (admin ? getDocs(query(collection(db, "calls"), limit(100))) : getDocs(query(collection(db, "calls"), where("clientId", "==", uid), limit(100)))) : Promise.resolve(null),
    needed.has("visits") && admin ? getDocs(query(collection(db, "websiteVisits"), orderBy("createdAt", "desc"), limit(2000))) : Promise.resolve(null),
    needed.has("visits") && admin ? getCountFromServer(collection(db, "websiteVisits")) : Promise.resolve(null),
    needed.has("visits") && admin ? getCountFromServer(collection(db, "websiteVisitors")) : Promise.resolve(null),
  ]);

  const submissions = [
    ...(inquiriesSnapshot?.docs.map((item) => submissionFrom(item, "inquiry")) ?? []),
    ...(submissionsSnapshot?.docs.map((item) => submissionFrom(item, "client")) ?? []),
  ].sort(byNewest);
  const documents = documentsSnapshot?.docs.map(documentFrom).sort(byNewest) ?? [];
  const invoices = invoicesSnapshot?.docs.map(invoiceFrom).sort(byNewest) ?? [];
  const profiles = profilesSnapshot?.docs.map(profileFrom) ?? [];
  const availability = availabilitySnapshot?.docs.map((item) => ({
    weekday: Number(item.id), enabled: Boolean(item.data().enabled), startTime: String(item.data().startTime ?? "09:00"),
    endTime: String(item.data().endTime ?? "17:00"), slotMinutes: Number(item.data().slotMinutes ?? 30),
  })).sort((a, b) => a.weekday - b.weekday) ?? [];
  const calls = callsSnapshot?.docs.map(callFrom).sort(byNewest) ?? [];
  const visits = visitsSnapshot?.docs.map(websiteVisitFrom).sort(byNewest) ?? [];
  const outstandingCents = invoices.filter((item) => item.status !== "paid").reduce((sum, item) => sum + item.amountCents, 0);
  const metrics: Record<string, number> = admin ? {
    clients: profiles.length,
    inquiries: submissions.filter((item) => item.source === "inquiry" && item.status === "new").length,
    documents: documents.length,
    outstandingCents,
    websiteViews: viewsCountSnapshot?.data().count ?? 0,
    websiteVisitors: visitorsCountSnapshot?.data().count ?? 0,
  } : {
    requests: submissions.filter((item) => item.type === "service_request" && !["completed", "cancelled"].includes(item.status)).length,
    appointments: submissions.filter((item) => item.type === "consultation" && !["declined", "cancelled"].includes(item.status)).length,
    documents: documents.length,
    outstandingCents,
  };
  return { metrics, submissions, documents, invoices, profiles, availability, calls, visits };
}

export async function approveAndInvite(inquiryId: string, appUrl: string) {
  const { auth, functions } = getFirebaseServices();
  const call = httpsCallable<{ inquiryId: string }, { ok: boolean; email: string; uid: string }>(functions, "approveInquiry");
  const result = (await call({ inquiryId })).data;
  await sendPasswordResetEmail(auth, result.email, { url: `${appUrl}/login?invited=1`, handleCodeInApp: false });
  return result;
}

export async function updateSubmissionStatus(item: Submission, status: string) {
  const { db, functions } = getFirebaseServices();
  if (item.source === "inquiry") {
    const call = httpsCallable<{ inquiryId: string; status: string }, { ok: boolean }>(functions, "updateInquiryStatus");
    await call({ inquiryId: item.id, status });
  } else {
    await updateDoc(doc(db, "submissions", item.id), { status, updatedAt: serverTimestamp() });
  }
}

export async function saveAvailability(rules: AvailabilityRule[]) {
  if (rules.length !== 7 || new Set(rules.map((rule) => rule.weekday)).size !== 7) {
    throw new Error("Availability must include each day of the week exactly once.");
  }
  for (const rule of rules) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) throw new Error("Availability contains an invalid weekday.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.endTime)) throw new Error(`${weekdays[rule.weekday]} has an invalid time.`);
    if (rule.enabled && rule.startTime >= rule.endTime) throw new Error(`${weekdays[rule.weekday]} must end after it starts.`);
    if (![30, 45, 60, 90].includes(rule.slotMinutes)) throw new Error(`${weekdays[rule.weekday]} has an invalid slot length.`);
  }
  const { db } = getFirebaseServices();
  const batch = writeBatch(db);
  for (const rule of rules) batch.set(doc(db, "availability", String(rule.weekday)), { ...rule, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function uploadClientDocument(uid: string, file: File, category: string) {
  if (!file.size) throw new Error("Choose a non-empty document.");
  if (file.size > maximumDocumentBytes) throw new Error("Documents must be 10 MB or smaller.");
  const { db } = getFirebaseServices();
  const id = crypto.randomUUID();
  const documentRef = doc(db, "documents", id);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkCount = Math.ceil(bytes.byteLength / documentChunkBytes);
  const writtenChunks = [];
  try {
    await setDoc(documentRef, {
      ownerId: uid, fileName: file.name, category, status: "uploading", storageMode: "firestore-chunks",
      size: file.size, chunkCount, contentType: file.type || "application/octet-stream", createdAt: serverTimestamp(),
    });
    for (let index = 0; index < chunkCount; index += 1) {
      const chunkRef = doc(db, "documents", id, "chunks", String(index).padStart(4, "0"));
      const start = index * documentChunkBytes;
      await setDoc(chunkRef, { index, data: Bytes.fromUint8Array(bytes.slice(start, start + documentChunkBytes)) });
      writtenChunks.push(chunkRef);
    }
    await updateDoc(documentRef, { status: "received", uploadedChunks: chunkCount });
  } catch (error) {
    const cleanup = writeBatch(db);
    for (const chunkRef of writtenChunks) cleanup.delete(chunkRef);
    if (writtenChunks.length) await cleanup.commit().catch(() => undefined);
    await deleteDoc(documentRef).catch(() => undefined);
    throw error;
  }
}

export async function downloadClientDocument(item: DocumentRow) {
  if (item.storageMode !== "firestore-chunks" || item.status !== "received") {
    throw new Error("This document is not available from Firestore.");
  }
  const { db } = getFirebaseServices();
  const snapshot = await getDocs(query(collection(db, "documents", item.id, "chunks"), orderBy("index", "asc")));
  if (snapshot.size !== item.chunkCount) throw new Error("The document upload is incomplete.");
  const chunks = snapshot.docs.map((part) => {
    const value = part.data().data;
    if (!(value instanceof Bytes)) throw new Error("The document data is invalid.");
    return value.toUint8Array();
  });
  return new Blob(chunks, { type: item.contentType || "application/octet-stream" });
}

export async function createClientSubmission(user: WorkspaceUser, type: "service_request" | "message", fields: { service?: string; details: string }) {
  const { db } = getFirebaseServices();
  await addDoc(collection(db, "submissions"), {
    ownerId: user.uid, type, name: user.name, email: user.email, service: fields.service ?? "", details: fields.details,
    status: "new", createdAt: serverTimestamp(),
  });
}

export async function createInvoice(fields: { clientId: string; invoiceNumber: string; service: string; amountCents: number; dueDate: string }) {
  const { db } = getFirebaseServices();
  await addDoc(collection(db, "invoices"), { ...fields, status: "unpaid", createdAt: serverTimestamp() });
}

export async function loadProfile(uid: string) {
  const { db } = getFirebaseServices();
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? profileFrom(snapshot as QueryDocumentSnapshot<DocumentData>) : null;
}

export async function saveProfile(user: WorkspaceUser, fields: { fullName: string; company: string; phone: string }) {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "users", user.uid), { ...fields, email: user.email, role: user.role, updatedAt: serverTimestamp() }, { merge: true });
}

export async function createCall(client: Profile) {
  const { db } = getFirebaseServices();
  const roomName = `Rozan-${crypto.randomUUID().replaceAll("-", "")}`;
  await addDoc(collection(db, "calls"), {
    clientId: client.userId, clientName: client.fullName, roomName, status: "active", createdAt: serverTimestamp(),
  });
}

export async function endCall(id: string) {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, "calls", id), { status: "ended", endedAt: serverTimestamp() });
}

function timestamp(value: unknown) {
  return typeof (value as { toMillis?: () => number })?.toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : Number(value || 0);
}
function submissionFrom(item: QueryDocumentSnapshot<DocumentData>, source: Submission["source"]): Submission {
  const data = item.data();
  return { id: item.id, source, type: String(data.type ?? "inquiry"), name: String(data.name ?? ""), email: String(data.email ?? ""), company: data.company, service: data.service, preferredDate: data.preferredDate, preferredTime: data.preferredTime, details: data.details, status: String(data.status ?? "new"), createdAt: timestamp(data.createdAt), clientId: data.clientId };
}
function documentFrom(item: QueryDocumentSnapshot<DocumentData>): DocumentRow { const data = item.data(); return { id: item.id, ownerId: String(data.ownerId ?? ""), fileName: String(data.fileName ?? ""), category: String(data.category ?? "Other"), status: String(data.status ?? "received"), size: Number(data.size ?? 0), contentType: String(data.contentType ?? "application/octet-stream"), chunkCount: Number(data.chunkCount ?? 0), storageMode: data.storageMode === "firestore-chunks" ? "firestore-chunks" : "legacy-storage", createdAt: timestamp(data.createdAt) }; }
function invoiceFrom(item: QueryDocumentSnapshot<DocumentData>): Invoice { const data = item.data(); return { id: item.id, clientId: String(data.clientId ?? ""), invoiceNumber: String(data.invoiceNumber ?? ""), service: String(data.service ?? ""), amountCents: Number(data.amountCents ?? 0), dueDate: String(data.dueDate ?? ""), status: String(data.status ?? "unpaid"), createdAt: timestamp(data.createdAt) }; }
function profileFrom(item: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): Profile { const data = item.data() ?? {}; return { userId: item.id, email: String(data.email ?? ""), fullName: String(data.fullName ?? data.email ?? "Client"), company: data.company, phone: data.phone }; }
function callFrom(item: QueryDocumentSnapshot<DocumentData>): CallSession { const data = item.data(); return { id: item.id, clientId: String(data.clientId ?? ""), clientName: String(data.clientName ?? "Client"), roomName: String(data.roomName ?? ""), status: String(data.status ?? "active"), createdAt: timestamp(data.createdAt) }; }
function websiteVisitFrom(item: QueryDocumentSnapshot<DocumentData>): WebsiteVisit { const data = item.data(); const device = String(data.device ?? "desktop"); return { id: item.id, visitorId: String(data.visitorId ?? ""), sessionId: String(data.sessionId ?? ""), path: String(data.path ?? "/"), referrer: String(data.referrer ?? ""), source: String(data.source ?? "direct"), medium: String(data.medium ?? ""), campaign: String(data.campaign ?? ""), device: device === "mobile" || device === "tablet" ? device : "desktop", createdAt: timestamp(data.createdAt) }; }
function byNewest(a: { createdAt: number }, b: { createdAt: number }) { return b.createdAt - a.createdAt; }

function collectionsFor(role: Role, section: string) {
  const map: Record<string, string[]> = role === "admin" ? {
    overview: ["inquiries", "submissions", "documents", "invoices", "profiles", "visits"],
    analytics: ["visits"],
    inquiries: ["inquiries", "submissions"],
    availability: ["availability"],
    calls: ["calls", "profiles"],
    documents: ["documents"],
    clients: ["profiles"],
    invoices: ["invoices", "profiles"],
    settings: [],
  } : {
    overview: ["submissions", "documents", "invoices"],
    documents: ["documents"],
    requests: ["submissions"],
    appointments: ["submissions"],
    calls: ["calls"],
    messages: ["submissions"],
    invoices: ["invoices"],
    settings: [],
  };
  return new Set(map[section] ?? map.overview);
}
