import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { availableSlotsForDate, isValidDate, isValidTime, slotId, weekdayForDate, type AvailabilityRuleData } from "./availability.js";

initializeApp();

const db = getFirestore();
const allowedInquiryTypes = new Set(["consultation", "quote", "contact"]);
const allowedStatuses = new Set(["new", "in_review", "approved", "scheduled", "completed", "declined", "cancelled"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UnknownRecord = Record<string, unknown>;

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function requireAdmin(request: { auth?: { token: Record<string, unknown> } }) {
  if (!request.auth || request.auth.token.role !== "admin") {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
}

export const submitInquiry = onCall(async (request) => {
  const data = (request.data ?? {}) as UnknownRecord;
  const type = text(data.type, 30);
  const name = text(data.name, 100);
  const email = text(data.email, 200).toLowerCase();
  const details = text(data.details, 4000);
  const detailsRequired = type !== "consultation";
  if (!allowedInquiryTypes.has(type) || name.length < 2 || !emailPattern.test(email) || (detailsRequired && details.length < 4)) {
    throw new HttpsError("invalid-argument", "Please complete the required inquiry details.");
  }

  const record = {
    type,
    name,
    email,
    phone: text(data.phone, 40),
    company: text(data.company, 160),
    service: text(data.service, 160),
    preferredDate: text(data.preferredDate, 10),
    preferredTime: text(data.preferredTime, 5),
    consultationType: text(data.consultationType, 60),
    details,
    status: "new",
    createdAt: FieldValue.serverTimestamp(),
  };

  const inquiryRef = db.collection("inquiries").doc();
  if (type !== "consultation") {
    await inquiryRef.set(record);
    return { ok: true, id: inquiryRef.id };
  }

  if (!isValidDate(record.preferredDate) || !isValidTime(record.preferredTime)) {
    throw new HttpsError("invalid-argument", "Choose a valid consultation date and time.");
  }

  const availabilityRef = db.collection("availability").doc(String(weekdayForDate(record.preferredDate)));
  const lockRef = db.collection("bookingDays").doc(record.preferredDate).collection("slots").doc(record.preferredTime);
  const legacyLockRef = db.collection("bookingSlots").doc(slotId(record.preferredDate, record.preferredTime));
  await db.runTransaction(async (transaction) => {
    const availabilitySnapshot = await transaction.get(availabilityRef);
    const existing = await transaction.get(lockRef);
    const legacyExisting = await transaction.get(legacyLockRef);
    if (existing.exists || legacyExisting.exists) throw new HttpsError("already-exists", "That time was just booked. Please choose another slot.");
    const rule = availabilitySnapshot.data() as AvailabilityRuleData | undefined;
    if (!availableSlotsForDate(record.preferredDate, rule).includes(record.preferredTime)) {
      throw new HttpsError("failed-precondition", "That time is no longer available. Please choose another slot.");
    }
    transaction.create(inquiryRef, record);
    transaction.create(lockRef, {
      inquiryId: inquiryRef.id,
      preferredDate: record.preferredDate,
      preferredTime: record.preferredTime,
      status: "reserved",
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true, id: inquiryRef.id };
});

export const getAvailability = onCall(async (request) => {
  const date = text((request.data as UnknownRecord | undefined)?.date, 10);
  if (!isValidDate(date)) throw new HttpsError("invalid-argument", "A valid date is required.");
  const weekday = weekdayForDate(date);
  const ruleSnapshot = await db.collection("availability").doc(String(weekday)).get();
  const rule = ruleSnapshot.data() as AvailabilityRuleData | undefined;
  const candidates = availableSlotsForDate(date, rule);
  if (!candidates.length) return { ok: true, slots: [] };
  const locks = await Promise.all(candidates.map(async (time) => {
    const [current, legacy] = await db.getAll(
      db.collection("bookingDays").doc(date).collection("slots").doc(time),
      db.collection("bookingSlots").doc(slotId(date, time)),
    );
    return current.exists || legacy.exists;
  }));
  return { ok: true, slots: candidates.filter((_, index) => !locks[index]) };
});

export const approveInquiry = onCall(async (request) => {
  requireAdmin(request);
  const inquiryId = text((request.data as UnknownRecord | undefined)?.inquiryId, 120);
  if (!inquiryId) throw new HttpsError("invalid-argument", "Inquiry ID is required.");
  const inquiryRef = db.collection("inquiries").doc(inquiryId);
  const inquirySnapshot = await inquiryRef.get();
  if (!inquirySnapshot.exists) throw new HttpsError("not-found", "Inquiry not found.");
  const inquiry = inquirySnapshot.data() as UnknownRecord;
  const email = text(inquiry.email, 200).toLowerCase();
  const name = text(inquiry.name, 100);
  if (!emailPattern.test(email)) throw new HttpsError("failed-precondition", "The inquiry has no valid email address.");

  let account;
  try {
    account = await getAuth().getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    account = await getAuth().createUser({ email, displayName: name || undefined, disabled: false });
  }
  await getAuth().setCustomUserClaims(account.uid, { ...(account.customClaims ?? {}), role: "client" });
  const batch = db.batch();
  batch.set(db.collection("users").doc(account.uid), {
    email,
    fullName: name,
    company: text(inquiry.company, 160),
    phone: text(inquiry.phone, 40),
    role: "client",
    approvedInquiryId: inquiryId,
    approvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.update(inquiryRef, {
    status: "approved",
    clientId: account.uid,
    invitedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true, email, uid: account.uid };
});

export const updateInquiryStatus = onCall(async (request) => {
  requireAdmin(request);
  const data = (request.data ?? {}) as UnknownRecord;
  const inquiryId = text(data.inquiryId, 120);
  const status = text(data.status, 30);
  if (!inquiryId || !allowedStatuses.has(status)) throw new HttpsError("invalid-argument", "A valid inquiry and status are required.");
  const inquiryRef = db.collection("inquiries").doc(inquiryId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(inquiryRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Inquiry not found.");
    const inquiry = snapshot.data() as UnknownRecord;
    transaction.update(inquiryRef, { status, updatedAt: FieldValue.serverTimestamp() });
    if ((status === "declined" || status === "cancelled") && inquiry.type === "consultation") {
      const date = text(inquiry.preferredDate, 10);
      const time = text(inquiry.preferredTime, 5);
      if (date && time) {
        transaction.delete(db.collection("bookingDays").doc(date).collection("slots").doc(time));
        transaction.delete(db.collection("bookingSlots").doc(slotId(date, time)));
      }
    }
  });
  return { ok: true };
});

