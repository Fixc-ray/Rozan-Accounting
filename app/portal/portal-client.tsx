"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getIdTokenResult, onIdTokenChanged, signOut } from "firebase/auth";
import { BarChart3, CalendarClock, CalendarDays, Download, Eye, FileText, FolderLock, Inbox, LayoutDashboard, LogOut, Menu, MessageSquareText, PhoneCall, ReceiptText, Send, Settings, ShieldCheck, Upload, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firebaseConfigured, getFirebaseServices } from "@/lib/firebase/client";
import {
  approveAndInvite, createCall, createClientSubmission, createInvoice, downloadClientDocument, endCall, loadPortalData, loadProfile,
  saveAvailability, saveProfile, updateSubmissionStatus, uploadClientDocument, weekdays,
} from "@/lib/firebase/portal";
import type { AvailabilityRule, CallSession, DocumentRow, Invoice, PortalData, Profile, Role, Submission, WebsiteVisit, WorkspaceUser } from "@/lib/firebase/types";

type Mode = Role;

const clientNav = [["overview", "/portal", "Overview", LayoutDashboard], ["documents", "/portal/documents", "Documents", FolderLock], ["requests", "/portal/requests", "Service requests", Inbox], ["appointments", "/portal/appointments", "Appointments", CalendarDays], ["calls", "/portal/calls", "Calls", Video], ["messages", "/portal/messages", "Messages", MessageSquareText], ["invoices", "/portal/invoices", "Invoices", ReceiptText]] as const;
const adminNav = [["overview", "/admin", "Dashboard", LayoutDashboard], ["analytics", "/admin/analytics", "Website analytics", BarChart3], ["inquiries", "/admin/inquiries", "Inquiries", Inbox], ["availability", "/admin/availability", "Availability", CalendarClock], ["calls", "/admin/calls", "Calls", Video], ["documents", "/admin/documents", "Documents", FolderLock], ["clients", "/admin/clients", "Clients", Users], ["invoices", "/admin/invoices", "Invoices", ReceiptText]] as const;

export function PortalClient({ mode, initialSection }: { mode: Mode; initialSection: string }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) return;
    const { auth } = getFirebaseServices();
    return onIdTokenChanged(auth, async (account) => {
      if (!account) { router.replace("/login"); return; }
      const token = await getIdTokenResult(account, true);
      const role = token.claims.role;
      if (role !== "admin" && role !== "client") { await signOut(auth); router.replace("/login"); return; }
      if (role !== mode) { router.replace(role === "admin" ? "/admin" : "/portal"); return; }
      const workspaceUser = { uid: account.uid, name: account.displayName || account.email?.split("@")[0] || "Rozan user", email: account.email || "", role } satisfies WorkspaceUser;
      setUser(workspaceUser);
      setError("");
      try { setData(await loadPortalData(mode, workspaceUser.uid, initialSection)); }
      catch (reason) { setError(errorText(reason, "Workspace data could not be loaded.")); }
      finally { setLoading(false); }
    });
  }, [initialSection, mode, router]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError("");
    try { setData(await loadPortalData(mode, user.uid, initialSection)); }
    catch (reason) { setError(errorText(reason, "Workspace data could not be loaded.")); }
    finally { setLoading(false); }
  }, [initialSection, mode, user]);

  async function logout() {
    await signOut(getFirebaseServices().auth);
    router.replace("/login");
  }

  if (!firebaseConfigured) return <main className="auth-shell"><section className="auth-card"><h1>Firebase setup required</h1><p>Copy <code>.env.example</code> to <code>.env.local</code>, add the Firebase project values, then restart the app.</p><Link className="button" href="/">Back to website</Link></section></main>;
  if (!user) return <div className="portal-loading fullscreen"><span/><p>Verifying your Firebase account…</p></div>;
  const nav = mode === "admin" ? adminNav : clientNav;
  return <div className="portal-shell"><Toaster richColors position="top-right"/>
    <aside className={sidebarOpen ? "portal-sidebar open" : "portal-sidebar"}>
      <div className="portal-brand"><span className="brand-mark">R</span><span><strong>ROZAN</strong><small>{mode === "admin" ? "Admin workspace" : "Client portal"}</small></span><button onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X/></button></div>
      <nav>{nav.map(([key, href, label, Icon]) => <Link className={initialSection === key ? "active" : ""} href={href} key={key}><Icon/>{label}</Link>)}</nav>
      <div className="sidebar-bottom"><Link href={mode === "admin" ? "/admin/settings" : "/portal/settings"}><Settings/>Settings</Link><button onClick={() => void logout()}><LogOut/>Sign out</button></div>
    </aside>
    <div className="portal-main">
      <header className="portal-topbar"><button className="portal-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu/></button>{mode === "client" && <div className="client-workspace-label"><ShieldCheck/>Client workspace</div>}<Link className="topbar-site-link" href="/">View website</Link><div className="user-chip"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{mode === "admin" ? "Administrator" : user.email}</small></div></div></header>
      <main className="portal-content"><div className="portal-welcome"><div><p suppressHydrationWarning>{new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>{sectionTitle(mode, initialSection)}</h1><span>{mode === "admin" ? "Manage clients, invitations, calls and operating hours." : "Your records, calls and requests in one secure workspace."}</span></div></div>
        {loading && <div className="portal-loading"><span/><p>Loading Firebase workspace data…</p></div>}
        {error && <div className="portal-error"><strong>We couldn’t load this page.</strong><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div>}
        {data && <PortalSection mode={mode} section={initialSection} user={user} data={data} refresh={refresh}/>}
        <div className="portal-security"><ShieldCheck/><span><strong>Firebase protected</strong>Role-based access rules protect each client’s records.</span><small>Secure</small></div>
      </main>
    </div>
  </div>;
}

function PortalSection({ mode, section, user, data, refresh }: { mode: Mode; section: string; user: WorkspaceUser; data: PortalData; refresh: () => Promise<void> }) {
  if (section === "overview") return <Overview mode={mode} data={data}/>;
  if (section === "analytics" && mode === "admin") return <AnalyticsPanel data={data}/>;
  if (section === "documents") return <DocumentsPanel mode={mode} user={user} documents={data.documents} refresh={refresh}/>;
  if (section === "requests") return <RequestsPanel user={user} submissions={data.submissions} refresh={refresh}/>;
  if (section === "appointments") return <RecordsPanel title="Appointments" description="Consultations reserved through the live booking calendar." rows={data.submissions.filter((item) => item.type === "consultation")}/>;
  if (section === "calls") return <CallsPanel mode={mode} calls={data.calls} profiles={data.profiles} user={user} refresh={refresh}/>;
  if (section === "messages") return <MessagesPanel user={user} messages={data.submissions.filter((item) => item.type === "message")} refresh={refresh}/>;
  if (section === "inquiries") return <InquiriesPanel submissions={data.submissions} refresh={refresh}/>;
  if (section === "availability") return <AvailabilityPanel rules={data.availability} refresh={refresh}/>;
  if (section === "clients") return <ClientsPanel profiles={data.profiles}/>;
  if (section === "invoices") return <InvoicesPanel mode={mode} invoices={data.invoices} profiles={data.profiles} refresh={refresh}/>;
  if (section === "settings") return <ProfilePanel user={user}/>;
  return null;
}

function Overview({ mode, data }: { mode: Mode; data: PortalData }) {
  const cards = mode === "admin"
    ? [[data.metrics.websiteViews ?? 0, "Website views", Eye], [data.metrics.websiteVisitors ?? 0, "Unique visitors", BarChart3], [data.metrics.clients ?? 0, "Clients", Users], [data.metrics.inquiries ?? 0, "New inquiries", Inbox], [data.metrics.documents ?? 0, "Documents", FileText]] as const
    : [[data.metrics.requests ?? 0, "Open requests", Inbox], [data.metrics.appointments ?? 0, "Appointments", CalendarDays], [data.metrics.documents ?? 0, "Documents", FolderLock], [formatMoney(data.metrics.outstandingCents ?? 0), "Outstanding", ReceiptText]] as const;
  return <><div className="portal-metrics">{cards.map(([value, label, Icon]) => <article key={label}><div><span>{label}</span><Icon/></div><strong>{value}</strong><small>Live Firebase data</small></article>)}</div><div className="portal-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest saved requests</p></div></div><RecordList rows={data.submissions.slice(0, 6)}/></section><section className="panel"><div className="panel-heading"><div><h2>Recent documents</h2><p>Newest secure uploads</p></div></div>{data.documents.length ? <div className="document-summary">{data.documents.slice(0, 6).map((item) => <div key={item.id}><FileText/><span><strong>{item.fileName}</strong><small>{item.category} · {formatDate(item.createdAt)}</small></span></div>)}</div> : <Empty icon={FolderLock} title="No documents yet" text="New uploads will appear here."/>}</section></div></>;
}

function AnalyticsPanel({ data }: { data: PortalData }) {
  const now = new Date();
  const today = localDayKey(now);
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 6); sevenDaysAgo.setHours(0, 0, 0, 0);
  const todayViews = data.visits.filter((visit) => localDayKey(new Date(visit.createdAt)) === today).length;
  const weeklyVisits = data.visits.filter((visit) => visit.createdAt >= sevenDaysAgo.getTime());
  const weeklySessions = new Set(weeklyVisits.map((visit) => visit.sessionId)).size;
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(sevenDaysAgo); date.setDate(sevenDaysAgo.getDate() + index); return date; });
  const dayCounts = days.map((date) => weeklyVisits.filter((visit) => localDayKey(new Date(visit.createdAt)) === localDayKey(date)).length);
  const maxDay = Math.max(...dayCounts, 1);
  const sources = rankedCounts(data.visits.map((visit) => visit.source || "direct")).slice(0, 6);
  const maxSource = Math.max(...sources.map(([, count]) => count), 1);
  const cards = [[data.metrics.websiteViews ?? 0, "All page views", Eye], [data.metrics.websiteVisitors ?? 0, "Unique browsers", Users], [todayViews, "Views today", CalendarDays], [weeklySessions, "7-day sessions", BarChart3]] as const;

  return <>
    <div className="portal-metrics analytics-metrics">{cards.map(([value, label, Icon]) => <article key={label}><div><span>{label}</span><Icon/></div><strong>{value}</strong><small>Anonymous website analytics</small></article>)}</div>
    <div className="portal-grid analytics-grid">
      <section className="panel analytics-chart"><div className="panel-heading"><div><h2>Views over the last 7 days</h2><p>Page views recorded in the visitor&apos;s browser.</p></div></div><div className="analytics-bars">{days.map((date, index) => <div key={localDayKey(date)}><span className="analytics-bar-value">{dayCounts[index]}</span><span className="analytics-bar-track"><i style={{ height: `${Math.max(4, (dayCounts[index] / maxDay) * 100)}%` }}/></span><small>{new Intl.DateTimeFormat("en-KE", { weekday: "short" }).format(date)}</small></div>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Traffic sources</h2><p>UTM source or referring website.</p></div></div>{sources.length ? <div className="source-list">{sources.map(([source, count]) => <div key={source}><span><strong>{source}</strong><small>{count} view{count === 1 ? "" : "s"}</small></span><i><b style={{ width: `${Math.max(6, (count / maxSource) * 100)}%` }}/></i></div>)}</div> : <Empty icon={BarChart3} title="No traffic yet" text="Sources appear after the first website visit."/>}</section>
    </div>
    <section className="panel analytics-table"><div className="panel-heading"><div><h2>Recent visits</h2><p>Anonymous browser IDs, campaign attribution and pages viewed. No names or IP addresses are collected.</p></div></div>{data.visits.length ? <Table><TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>Source</TableHead><TableHead>Campaign</TableHead><TableHead>Device</TableHead><TableHead>Page</TableHead><TableHead>Viewed</TableHead></TableRow></TableHeader><TableBody>{data.visits.slice(0, 100).map((visit) => <VisitRow visit={visit} key={visit.id}/>)}</TableBody></Table> : <Empty icon={Eye} title="No website views yet" text="Visits will appear after the updated Firestore rules are deployed."/>}</section>
  </>;
}

function VisitRow({ visit }: { visit: WebsiteVisit }) {
  return <TableRow><TableCell><code>{visit.visitorId.slice(0, 8)}</code></TableCell><TableCell>{visit.source || "direct"}{visit.medium ? <small className="analytics-secondary">{visit.medium}</small> : null}</TableCell><TableCell>{visit.campaign || "—"}</TableCell><TableCell className="analytics-device">{visit.device}</TableCell><TableCell>{visit.path}</TableCell><TableCell>{formatDateTime(visit.createdAt)}</TableCell></TableRow>;
}

function DocumentsPanel({ mode, user, documents, refresh }: { mode: Mode; user: WorkspaceUser; documents: DocumentRow[]; refresh: () => Promise<void> }) {
  const [category, setCategory] = useState("Tax documents"); const [uploading, setUploading] = useState(false);
  async function upload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const file = new FormData(form).get("file"); if (!(file instanceof File)) return; setUploading(true); try { await uploadClientDocument(user.uid, file, category); toast.success("Document uploaded securely"); form.reset(); await refresh(); } catch (reason) { toast.error(errorText(reason, "Upload failed.")); } finally { setUploading(false); } }
  return <section className="panel"><div className="panel-heading"><div><h2>{mode === "admin" ? "Client documents" : "Secure documents"}</h2><p>Encrypted in transit and protected by Firestore access rules.</p></div></div>{mode === "client" && <form className="upload-row" onSubmit={upload}><input required type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"/><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Tax documents", "Bank statements", "Invoices", "Receipts", "Payroll", "Financial statements", "Contracts", "Other"].map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select><button className="portal-primary" disabled={uploading}><Upload/>{uploading ? "Uploading…" : "Upload securely"}</button></form>}<DocumentTable documents={documents}/></section>;
}

function RequestsPanel({ user, submissions, refresh }: { user: WorkspaceUser; submissions: Submission[]; refresh: () => Promise<void> }) {
  const [service, setService] = useState("Bookkeeping & Accounting"); const [details, setDetails] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSending(true); try { await createClientSubmission(user, "service_request", { service, details }); toast.success("Service request submitted"); setDetails(""); await refresh(); } catch (reason) { toast.error(errorText(reason, "Request could not be submitted.")); } finally { setSending(false); } }
  return <div className="portal-grid request-layout"><section className="panel"><div className="panel-heading"><div><h2>Request a service</h2><p>Saved directly to the admin workspace.</p></div></div><form className="request-form" onSubmit={submit}><Select value={service} onValueChange={setService}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Bookkeeping & Accounting", "Tax Services", "Payroll", "Business Advisory", "Audit & Assurance", "Company Formation"].map((item) => <SelectItem value={item} key={item}>{item}</SelectItem>)}</SelectContent></Select><textarea required value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What would you like us to handle?"/><button className="portal-primary" disabled={sending}>{sending ? "Submitting…" : "Submit request"}</button></form></section><section className="panel"><div className="panel-heading"><div><h2>Your requests</h2><p>Current status from Rozan</p></div></div><RecordList rows={submissions.filter((item) => item.type === "service_request")}/></section></div>;
}

function MessagesPanel({ user, messages, refresh }: { user: WorkspaceUser; messages: Submission[]; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSending(true); try { await createClientSubmission(user, "message", { details: message }); toast.success("Message sent"); setMessage(""); await refresh(); } catch (reason) { toast.error(errorText(reason, "Message could not be sent.")); } finally { setSending(false); } }
  return <section className="panel message-panel full-message"><div><span className="activity-icon"><MessageSquareText/></span><div><h2>Message your Rozan team</h2><p>Messages are saved with your Firebase account.</p></div></div><form onSubmit={submit}><input required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask a question about your accounts…"/><button disabled={sending} aria-label="Send message"><Send/></button></form><RecordList rows={messages}/></section>;
}

function InquiriesPanel({ submissions, refresh }: { submissions: Submission[]; refresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState("");
  async function changeStatus(item: Submission, status: string) { setBusyId(item.id); try { await updateSubmissionStatus(item, status); toast.success("Inquiry updated"); await refresh(); } catch (reason) { toast.error(errorText(reason, "Status could not be updated.")); } finally { setBusyId(""); } }
  async function approve(item: Submission) { setBusyId(item.id); try { await approveAndInvite(item.id, window.location.origin); toast.success(`Client approved. Firebase sent a password setup email to ${item.email}.`); await refresh(); } catch (reason) { toast.error(errorText(reason, "Client invitation could not be sent.")); } finally { setBusyId(""); } }
  return <section className="panel"><div className="panel-heading"><div><h2>Inquiries &amp; requests</h2><p>Approve an inquiry and send client access in one click.</p></div></div>{submissions.length ? <div className="inquiry-list">{submissions.map((item) => <article key={`${item.source}-${item.id}`}><div><strong>{item.name}</strong><span>{item.company || item.email}</span><small>{item.service || item.type.replaceAll("_", " ")} · {formatDate(item.createdAt)}</small>{item.details && <p>{item.details}</p>}</div><div className="inquiry-actions">{item.source === "inquiry" && !item.clientId && !["declined", "cancelled"].includes(item.status) && <button className="portal-primary invite-button" disabled={busyId === item.id} onClick={() => void approve(item)}>{busyId === item.id ? "Working…" : "Approve & invite"}</button>}<Select value={item.status} disabled={busyId === item.id} onValueChange={(value) => void changeStatus(item, value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["new", "in_review", "approved", "scheduled", "completed", "declined", "cancelled"].map((status) => <SelectItem value={status} key={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div></article>)}</div> : <Empty icon={Inbox} title="No enquiries yet" text="New website and client submissions will appear here."/>}</section>;
}

function AvailabilityPanel({ rules, refresh }: { rules: AvailabilityRule[]; refresh: () => Promise<void> }) {
  const [schedule, setSchedule] = useState(() => weekdays.map((_, weekday) => rules.find((rule) => rule.weekday === weekday) ?? { weekday, enabled: weekday > 0 && weekday < 6, startTime: "09:00", endTime: "17:00", slotMinutes: 60 })); const [saving, setSaving] = useState(false);
  function update(weekday: number, values: Partial<AvailabilityRule>) { setSchedule((current) => current.map((rule) => rule.weekday === weekday ? { ...rule, ...values } : rule)); }
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); try { await saveAvailability(schedule); toast.success("Weekly availability saved"); await refresh(); } catch (reason) { toast.error(errorText(reason, "Availability could not be saved.")); } finally { setSaving(false); } }
  return <section className="panel"><div className="panel-heading"><div><h2>Consultation availability</h2><p>Booked slots are atomically locked so two clients cannot reserve the same time.</p></div></div><form className="availability-form" onSubmit={save}>{schedule.map((rule) => <div className={rule.enabled ? "availability-row" : "availability-row disabled"} key={rule.weekday}><div><Switch checked={rule.enabled} onCheckedChange={(enabled) => update(rule.weekday, { enabled })}/><strong>{weekdays[rule.weekday]}</strong></div><label>From<input type="time" value={rule.startTime} disabled={!rule.enabled} onChange={(event) => update(rule.weekday, { startTime: event.target.value })}/></label><label>To<input type="time" value={rule.endTime} disabled={!rule.enabled} onChange={(event) => update(rule.weekday, { endTime: event.target.value })}/></label><label>Slot<Select value={String(rule.slotMinutes)} disabled={!rule.enabled} onValueChange={(value) => update(rule.weekday, { slotMinutes: Number(value) })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[30, 45, 60, 90].map((minutes) => <SelectItem value={String(minutes)} key={minutes}>{minutes} min</SelectItem>)}</SelectContent></Select></label></div>)}<button className="portal-primary" disabled={saving}>{saving ? "Saving…" : "Save weekly hours"}</button></form></section>;
}

function CallsPanel({ mode, calls, profiles, user, refresh }: { mode: Mode; calls: CallSession[]; profiles: Profile[]; user: WorkspaceUser; refresh: () => Promise<void> }) {
  const [clientId, setClientId] = useState(profiles[0]?.userId ?? ""); const [room, setRoom] = useState<CallSession | null>(null); const [busy, setBusy] = useState(false);
  async function start() { const client = profiles.find((item) => item.userId === clientId); if (!client) return; setBusy(true); try { await createCall(client); toast.success("Secure call room created"); await refresh(); } catch (reason) { toast.error(errorText(reason, "Call room could not be created.")); } finally { setBusy(false); } }
  async function close(call: CallSession) { setBusy(true); try { await endCall(call.id); if (room?.id === call.id) setRoom(null); await refresh(); } catch (reason) { toast.error(errorText(reason, "Call could not be ended.")); } finally { setBusy(false); } }
  const active = calls.filter((item) => item.status === "active");
  return <div className="calls-layout">{mode === "admin" && <section className="panel call-create"><div className="panel-heading"><div><h2>Start a client call</h2><p>Create a private, hard-to-guess Jitsi room for an approved client.</p></div></div>{profiles.length ? <div className="call-controls"><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Choose client"/></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem value={item.userId} key={item.userId}>{item.fullName}</SelectItem>)}</SelectContent></Select><button className="portal-primary" disabled={!clientId || busy} onClick={() => void start()}><PhoneCall/>Create call</button></div> : <Empty icon={Users} title="No approved clients" text="Approve an inquiry before starting a call."/>}</section>}<section className="panel"><div className="panel-heading"><div><h2>{mode === "admin" ? "Active client calls" : "Calls with Rozan"}</h2><p>Audio and video are provided by Jitsi Meet.</p></div></div>{active.length ? <div className="call-list">{active.map((call) => <article key={call.id}><span><Video/></span><div><strong>{mode === "admin" ? call.clientName : "Rozan consultation"}</strong><small>Created {formatDate(call.createdAt)}</small></div><button className="portal-primary" onClick={() => setRoom(call)}>Join call</button>{mode === "admin" && <button className="call-end" disabled={busy} onClick={() => void close(call)}>End</button>}</article>)}</div> : <Empty icon={Video} title="No active calls" text={mode === "admin" ? "Create a room when you are ready to speak with a client." : "Rozan will create a room when it is time for your call."}/>}</section>{room && <JitsiRoom call={room} user={user} onClose={() => setRoom(null)}/>}</div>;
}

function JitsiRoom({ call, user, onClose }: { call: CallSession; user: WorkspaceUser; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null); const api = useRef<{ dispose: () => void } | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => { if (!ready || !host.current || !window.JitsiMeetExternalAPI) return; api.current = new window.JitsiMeetExternalAPI("meet.jit.si", { roomName: call.roomName, parentNode: host.current, width: "100%", height: 620, userInfo: { email: user.email, displayName: user.name }, configOverwrite: { prejoinPageEnabled: true, startWithAudioMuted: true } }); return () => { api.current?.dispose(); api.current = null; }; }, [call.roomName, ready, user.email, user.name]);
  return <section className="panel jitsi-panel"><Script src="https://meet.jit.si/external_api.js" strategy="lazyOnload" onLoad={() => setReady(true)}/><div className="panel-heading"><div><h2>Live call</h2><p>Allow camera and microphone access when prompted.</p></div><button className="call-end" onClick={onClose}>Close room</button></div><div className="jitsi-host" ref={host}>{!ready && <div className="portal-loading"><span/><p>Loading secure call…</p></div>}</div></section>;
}

function ClientsPanel({ profiles }: { profiles: Profile[] }) { return <section className="panel"><div className="panel-heading"><div><h2>Approved clients</h2><p>Only admin-approved Firebase accounts appear here.</p></div></div>{profiles.length ? <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead></TableRow></TableHeader><TableBody>{profiles.map((item) => <TableRow key={item.userId}><TableCell>{item.fullName}</TableCell><TableCell>{item.company || "—"}</TableCell><TableCell>{item.email}</TableCell><TableCell>{item.phone || "—"}</TableCell></TableRow>)}</TableBody></Table> : <Empty icon={Users} title="No approved clients yet" text="Approve an inquiry to create the first client account."/>}</section>; }

function InvoicesPanel({ mode, invoices, profiles, refresh }: { mode: Mode; invoices: Invoice[]; profiles: Profile[]; refresh: () => Promise<void> }) { return <div className={mode === "admin" ? "portal-grid invoice-layout" : ""}>{mode === "admin" && <InvoiceForm profiles={profiles} refresh={refresh}/>}<section className="panel"><div className="panel-heading"><div><h2>Invoices</h2><p>Live billing records from Firestore.</p></div></div>{invoices.length ? <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Service</TableHead><TableHead>Due</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{invoices.map((item) => <TableRow key={item.id}><TableCell>{item.invoiceNumber}</TableCell><TableCell>{item.service}</TableCell><TableCell>{item.dueDate}</TableCell><TableCell>{formatMoney(item.amountCents)}</TableCell><TableCell><span className={`status ${item.status}`}>{item.status}</span></TableCell></TableRow>)}</TableBody></Table> : <Empty icon={ReceiptText} title="No invoices yet" text="Saved invoices will appear here."/>}</section></div>; }

function InvoiceForm({ profiles, refresh }: { profiles: Profile[]; refresh: () => Promise<void> }) {
  const [clientId, setClientId] = useState(profiles[0]?.userId ?? ""); const [invoiceNumber, setInvoiceNumber] = useState(""); const [service, setService] = useState(""); const [amount, setAmount] = useState(""); const [dueDate, setDueDate] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await createInvoice({ clientId, invoiceNumber, service, amountCents: Math.round(Number(amount) * 100), dueDate }); toast.success("Invoice saved"); setInvoiceNumber(""); setService(""); setAmount(""); setDueDate(""); await refresh(); } catch (reason) { toast.error(errorText(reason, "Invoice could not be saved.")); } finally { setSaving(false); } }
  return <section className="panel"><div className="panel-heading"><div><h2>Create invoice</h2><p>Add a live client billing record.</p></div></div>{profiles.length ? <form className="request-form" onSubmit={submit}><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Choose client"/></SelectTrigger><SelectContent>{profiles.map((item) => <SelectItem value={item.userId} key={item.userId}>{item.fullName}</SelectItem>)}</SelectContent></Select><input required value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Invoice number"/><input required value={service} onChange={(event) => setService(event.target.value)} placeholder="Service"/><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in KES"/><input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/><button className="portal-primary" disabled={saving}>{saving ? "Saving…" : "Create invoice"}</button></form> : <Empty icon={Users} title="Approve a client first" text="A client account is required before invoicing."/>}</section>;
}

function ProfilePanel({ user }: { user: WorkspaceUser }) {
  const [fullName, setFullName] = useState(user.name); const [company, setCompany] = useState(""); const [phone, setPhone] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { void loadProfile(user.uid).then((profile) => { if (profile) { setFullName(profile.fullName); setCompany(profile.company ?? ""); setPhone(profile.phone ?? ""); } }); }, [user.uid]);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); try { await saveProfile(user, { fullName, company, phone }); toast.success("Profile updated"); } catch (reason) { toast.error(errorText(reason, "Profile could not be saved.")); } finally { setSaving(false); } }
  return <section className="panel settings-panel"><div className="panel-heading"><div><h2>Account settings</h2><p>Update the details attached to your Firebase identity.</p></div></div><form className="auth-form" onSubmit={submit}><label>Email<input value={user.email} disabled/></label><label>Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)}/></label><label>Company<input value={company} onChange={(event) => setCompany(event.target.value)}/></label><label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)}/></label><button className="portal-primary" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></form></section>;
}

function RecordsPanel({ title, description, rows }: { title: string; description: string; rows: Submission[] }) { return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div><RecordList rows={rows}/></section>; }
function RecordList({ rows }: { rows: Submission[] }) { return rows.length ? <div className="activity-list">{rows.map((item) => <div key={`${item.source}-${item.id}`}><span className="activity-icon"><Inbox/></span><div><strong>{item.service || item.type.replaceAll("_", " ")}</strong><p>{item.company || item.name}{item.preferredDate ? ` · ${item.preferredDate}${item.preferredTime ? ` at ${item.preferredTime}` : ""}` : ""}</p></div><b className={`status ${item.status}`}>{item.status.replaceAll("_", " ")}</b></div>)}</div> : <Empty icon={Inbox} title="Nothing here yet" text="New saved activity will appear here."/>; }
function DocumentTable({ documents }: { documents: DocumentRow[] }) {
  const [downloadingId, setDownloadingId] = useState("");
  async function download(item: DocumentRow) {
    setDownloadingId(item.id);
    try {
      const blob = await downloadClientDocument(item);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = item.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      toast.error(errorText(reason, "Document could not be downloaded."));
    } finally {
      setDownloadingId("");
    }
  }
  return documents.length ? <Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Uploaded</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{documents.map((item) => <TableRow key={item.id}><TableCell><FileText/> {item.fileName}</TableCell><TableCell>{item.category}</TableCell><TableCell><span className="status">{item.status}</span></TableCell><TableCell>{formatDate(item.createdAt)}</TableCell><TableCell>{item.storageMode === "firestore-chunks" && item.status === "received" ? <button className="document-download" disabled={downloadingId === item.id} onClick={() => void download(item)}><Download/>{downloadingId === item.id ? "Preparing…" : "Download"}</button> : <span className="legacy-document">Legacy file</span>}</TableCell></TableRow>)}</TableBody></Table> : <Empty icon={FolderLock} title="No uploaded documents yet" text="Secure uploads will appear here."/>;
}
function Empty({ icon: Icon, title, text }: { icon: typeof Inbox; title: string; text: string }) { return <div className="empty-state"><Icon/><strong>{title}</strong><span>{text}</span></div>; }

function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(value: number) { return value ? new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Just now"; }
function formatDateTime(value: number) { return value ? new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Just now"; }
function formatMoney(cents: number) { return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(cents / 100); }
function localDayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function rankedCounts(values: string[]) { const counts = new Map<string, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1); return [...counts.entries()].sort((a, b) => b[1] - a[1]); }
function sectionTitle(mode: Mode, section: string) { return section === "overview" ? (mode === "admin" ? "Firm overview" : "Your financial workspace") : section.charAt(0).toUpperCase() + section.slice(1); }
function errorText(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: { roomName: string; parentNode: HTMLElement; width: string; height: number; userInfo: { email: string; displayName: string }; configOverwrite: Record<string, boolean> }) => { dispose: () => void };
  }
}
