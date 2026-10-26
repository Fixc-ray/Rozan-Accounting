"use client";

import { useEffect } from "react";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseConfigured, getFirebaseServices } from "@/lib/firebase/client";

const visitorKey = "rozan.analytics.visitor";
const visitorRegisteredKey = "rozan.analytics.visitor-registered";
const sessionKey = "rozan.analytics.session";

export function WebsiteAnalytics() {
  useEffect(() => {
    if (!firebaseConfigured || typeof window === "undefined") return;

    const visitorId = storedId(localStorage, visitorKey);
    const sessionId = storedId(sessionStorage, sessionKey);
    const url = new URL(window.location.href);
    const referrer = safeReferrer(document.referrer);
    const source = clean(url.searchParams.get("utm_source"), 100) || referrer || "direct";
    const device = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";
    const { db } = getFirebaseServices();

    void addDoc(collection(db, "websiteVisits"), {
      visitorId,
      sessionId,
      path: clean(`${url.pathname}${url.hash}`, 250) || "/",
      referrer,
      source,
      medium: clean(url.searchParams.get("utm_medium"), 100),
      campaign: clean(url.searchParams.get("utm_campaign"), 100),
      device,
      createdAt: serverTimestamp(),
    }).catch(() => undefined);

    if (localStorage.getItem(visitorRegisteredKey) !== visitorId) {
      void setDoc(doc(db, "websiteVisitors", visitorId), {
        visitorId,
        createdAt: serverTimestamp(),
      }).then(() => localStorage.setItem(visitorRegisteredKey, visitorId)).catch(() => undefined);
    }
  }, []);

  return null;
}

function storedId(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing && /^[a-zA-Z0-9-]{20,64}$/.test(existing)) return existing;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

function clean(value: string | null, max: number) {
  return (value ?? "").trim().slice(0, max);
}

function safeReferrer(value: string) {
  if (!value) return "";
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return hostname === window.location.hostname ? "" : clean(hostname, 200);
  } catch {
    return "";
  }
}
