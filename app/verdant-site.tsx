"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowRight, BarChart3, BookOpen, Building2, CalendarDays,
  Check, ChevronRight, ClipboardCheck, LockKeyhole,
  Menu, ReceiptText, Scale, ShieldCheck, Sparkles, Users, X
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAvailableSlots, submitPublicInquiry } from "@/lib/firebase/portal";
import { WebsiteAnalytics } from "@/components/website-analytics";

const InquiryAgent = dynamic(
  () => import("@/components/inquiry-agent").then((module) => module.InquiryAgent),
  { ssr: false },
);

type Flow = "book" | "quote" | null;
type Intake = {
  name: string; email: string; phone: string; company: string; service: string;
  date: string; time: string; meeting: string; details: string; industry: string; size: string;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: {
        name: string;
        title?: string;
        description: string;
        inputSchema: object;
        annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
        execute(input: unknown): unknown | Promise<unknown>;
      }, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

const emptyIntake: Intake = { name: "", email: "", phone: "", company: "", service: "", date: "", time: "", meeting: "Video call", details: "", industry: "", size: "" };

const services = [
  { icon: BookOpen, title: "Bookkeeping & Accounting", text: "Reliable books, management accounts and monthly reporting that keep decisions grounded.", benefits: ["Monthly close", "Financial statements", "AP & AR oversight"] },
  { icon: ReceiptText, title: "Tax Services", text: "Forward-looking planning and disciplined compliance for businesses and their owners.", benefits: ["Tax planning", "Corporate tax", "Compliance reviews"] },
  { icon: Users, title: "Payroll", text: "Accurate, confidential payroll built around your people and statutory obligations.", benefits: ["Payroll processing", "Employee records", "Statutory reporting"] },
  { icon: BarChart3, title: "Business Advisory", text: "Strategic finance support that turns performance data into decisive action.", benefits: ["Cash-flow planning", "Margin analysis", "Growth modelling"] },
  { icon: Scale, title: "Audit & Assurance", text: "Independent scrutiny, stronger controls and reporting stakeholders can trust.", benefits: ["Financial audits", "Internal controls", "Compliance reviews"] },
  { icon: Building2, title: "Company Formation", text: "Start with the right structure, registrations and financial systems from day one.", benefits: ["Business registration", "Entity structuring", "Finance setup"] },
];

const industries = ["Restaurants & Hospitality", "Retail", "Technology", "Construction", "Real Estate", "Professional Services", "Healthcare", "Startups", "E-commerce", "SMEs"];

const differentiators = [
  { icon: ClipboardCheck, title: "Accuracy", text: "Disciplined reviews and clear audit trails protect the integrity of every figure." },
  { icon: ShieldCheck, title: "Compliance", text: "Stay ahead of tax obligations, filing dates and changing requirements." },
  { icon: BarChart3, title: "Insight", text: "See what is driving performance—not simply what happened last month." },
  { icon: Users, title: "Partnership", text: "Senior advisors who understand your goals and challenge your thinking." },
  { icon: Sparkles, title: "Technology", text: "Connected systems reduce administration and keep information current." },
  { icon: LockKeyhole, title: "Security", text: "Permissioned access and protected document storage keep sensitive data private." },
];

const faqs = [
  ["What accounting services do you provide?", "We provide bookkeeping, management accounts, tax, payroll, audit, company formation and ongoing business advisory support."],
  ["How much do accounting services cost?", "Fees depend on transaction volume, reporting needs and complexity. We agree a clear proposal before work begins."],
  ["Can you handle my business payroll?", "Yes. We manage recurring payroll, employee records, deductions, reporting and year-end requirements."],
  ["Do you provide tax planning?", "Yes. We plan throughout the year so obligations, reliefs and cash requirements are understood in advance."],
  ["Can I access my documents online?", "Yes. Clients use a protected portal to upload, review and organise financial documents."],
  ["How do I book a consultation?", "Choose a service, date, time and meeting format in the booking form. We confirm the appointment by email."],
  ["Do you work with startups?", "Yes. We help founders choose structures, set up financial systems and build reporting for confident growth."],
  ["How often should my books be updated?", "Most growing businesses benefit from monthly bookkeeping; higher-volume businesses may need weekly processing."],
];

export function RozanSite() {
  const [flow, setFlow] = useState<Flow>(null);
  const [step, setStep] = useState(1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [serviceDetail, setServiceDetail] = useState<(typeof services)[number] | null>(null);
  const [form, setForm] = useState<Intake>(emptyIntake);
  const [sending, setSending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const availabilityRequest = useRef(0);

  const openFlow = (next: Flow, service = "") => {
    availabilityRequest.current += 1;
    setForm({ ...emptyIntake, service });
    setSlots([]);
    setSlotsLoading(false);
    setStep(1);
    setComplete(false);
    setFlow(next);
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "start_consultation_request",
      title: "Start a consultation request",
      description: "Opens the Rozan consultation form and preselects an optional accounting service.",
      inputSchema: { type: "object", properties: { service: { type: "string", maxLength: 100 } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Input must be an object.");
        const data = input as Record<string, unknown>;
        if (Object.keys(data).some((key) => key !== "service")) throw new Error("Unsupported input field.");
        if (data.service !== undefined && (typeof data.service !== "string" || data.service.length > 100)) throw new Error("Service must be a string of 100 characters or fewer.");
        const service = typeof data.service === "string" ? data.service : "";
        openFlow("book", service);
        return { status: "ready", selectedService: service || null };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const updateBookingDate = (date: string) => {
    const request = ++availabilityRequest.current;
    setForm((current) => ({ ...current, date, time: "" }));
    setSlots([]);
    if (!date) { setSlotsLoading(false); return; }
    setSlotsLoading(true);
    void getAvailableSlots(date)
      .then((available) => { if (request === availabilityRequest.current) setSlots(available); })
      .catch((error) => { if (request === availabilityRequest.current) toast.error(error instanceof Error ? error.message : "Availability could not be loaded."); })
      .finally(() => { if (request === availabilityRequest.current) setSlotsLoading(false); });
  };

  const update = (field: keyof Intake, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const continueFlow = () => {
    if (step === 1 && !form.service) return toast.error("Choose a service to continue.");
    if (step === 1 && flow === "quote" && !form.details.trim()) return toast.error("Tell us what you need for the proposal.");
    if (step === 2 && flow === "book" && (!form.date || !form.time)) return toast.error("Choose an available date and time.");
    setStep((current) => Math.min(3, current + 1));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    try {
      const type = flow === "quote" ? "quote" : "consultation";
      await submitPublicInquiry({
        type, name: form.name, email: form.email, phone: form.phone, company: form.company,
        service: form.service, preferredDate: form.date, preferredTime: form.time,
        consultationType: form.meeting, details: [form.details, form.industry && `Industry: ${form.industry}`, form.size && `Business size: ${form.size}`].filter(Boolean).join("\n"),
      });
      setComplete(true);
      toast.success(type === "quote" ? "Quote request received" : "Consultation request received");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main>
      <WebsiteAnalytics />
      <Toaster richColors position="top-right" />
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Rozan Accounting home">
          <span className="brand-mark">R</span><span><strong>ROZAN</strong><small>Accounting &amp; Advisory</small></span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="#services">Services</Link><Link href="#about">About</Link><Link href="#industries">Industries</Link><Link href="#insights">Insights</Link><Link href="#contact">Contact</Link>
        </nav>
        <div className="nav-actions"><Link className="link-button login" href="/login">Workspace login</Link><button className="button small" onClick={() => openFlow("book")}>Book a consultation</button><button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label="Toggle navigation">{mobileOpen ? <X/> : <Menu/>}</button></div>
        {mobileOpen && <div className="mobile-menu">{[["Services","services"],["About","about"],["Industries","industries"],["Insights","insights"],["Contact","contact"]].map(([label,id]) => <Link href={`#${id}`} onClick={() => setMobileOpen(false)} key={id}>{label}</Link>)}<Link href="/login">Workspace login</Link></div>}
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Accounting · Tax · Advisory</p>
          <h1>Financial clarity for <em>ambitious</em> businesses.</h1>
          <p className="lede">Expert accounting, tax, and business advisory services designed to help you understand your numbers, make better decisions, and build with confidence.</p>
          <div className="hero-actions"><button className="button" onClick={() => openFlow("book")}>Book a consultation <CalendarDays size={18}/></button><Link className="text-link" href="#services">Explore our services</Link></div>
          <div className="trust-note"><LockKeyhole size={16}/><span>Secure client portal</span><i/><span>Senior-led advice</span><i/><span>Clear proposals</span></div>
        </div>
        <div className="hero-visual">
          <Image src="/verdant-hero-advisory.png" alt="Business owner and financial advisor reviewing a cash-flow report" fill priority sizes="(max-width: 1050px) 100vw, 48vw" />
          <div className="chart-card"><span>Decision-ready reporting</span><strong>Clear</strong><svg viewBox="0 0 240 70" aria-hidden="true"><path d="M2 62 C44 56,51 41,89 47 S145 15,173 25 S214 8,238 4"/></svg></div>
          <div className="proof-card"><strong>Secure</strong><span>client workspace</span></div>
        </div>
      </section>

      <section className="metrics" aria-label="Firm approach"><p>Trusted financial guidance<br/>for businesses at every stage.</p><dl><div><dt>Monthly</dt><dd>Decision-ready reporting</dd></div><div><dt>Forward</dt><dd>Proactive tax planning</dd></div><div><dt>Secure</dt><dd>Protected client records</dd></div><div><dt>Clear</dt><dd>Practical senior advice</dd></div></dl></section>

      <section className="section services-section" id="services">
        <div className="section-heading"><div><p className="eyebrow"><span/>Services</p><h2>Accounting that goes<br/><em>beyond the numbers.</em></h2></div><p>From the monthly close to board-level decisions, our specialists bring discipline to the detail and perspective to the bigger picture.</p></div>
        <div className="service-grid">{services.map((service, index) => { const Icon = service.icon; return <article className="service-card" key={service.title}><div className="service-number">0{index + 1}</div><Icon/><h3>{service.title}</h3><p>{service.text}</p><ul>{service.benefits.map((benefit) => <li key={benefit}><Check size={14}/>{benefit}</li>)}</ul><button onClick={() => setServiceDetail(service)}>Learn more <ChevronRight size={15}/></button></article>; })}</div>
      </section>

      <section className="featured">
        <div className="featured-image"><Image src="/verdant-advisory-workspace.png" alt="Financial planning workbook and digital reporting tools" fill sizes="(max-width: 900px) 100vw, 50vw"/></div>
        <div className="featured-copy"><p className="eyebrow light"><span/>Featured service</p><h2>Turn your financial data into better decisions.</h2><p>Our advisory team helps owners understand the levers behind revenue, margin, cash flow and tax—then builds a practical plan around them.</p><div className="data-points"><span>Revenue quality</span><span>Profit margins</span><span>Cash runway</span><span>Growth capacity</span></div><button className="button ivory" onClick={() => openFlow("book", "Business Advisory")}>Talk to an advisor <ArrowRight size={17}/></button></div>
      </section>

      <section className="section industries-section" id="industries"><div className="section-heading"><div><p className="eyebrow"><span/>Industries</p><h2>Financial expertise built<br/><em>around your industry.</em></h2></div><p>Sector fluency helps us spot the risks, ratios and opportunities that matter sooner.</p></div><div className="industry-list">{industries.map((industry, i) => <button key={industry} onClick={() => openFlow("book", industry)}><span>{String(i + 1).padStart(2, "0")}</span>{industry}<ArrowRight size={17}/></button>)}</div></section>

      <section className="section why-section"><div className="center-heading"><p className="eyebrow"><span/>Why Rozan</p><h2>Rigour in the details.<br/><em>Perspective for what’s next.</em></h2></div><div className="why-grid">{differentiators.map(({ icon: Icon, title, text }) => <article key={title}><Icon/><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section className="process-section"><div><p className="eyebrow light"><span/>Our process</p><h2>A simpler way to manage your finances.</h2></div><ol>{[["01","Consultation","Tell us about the business and what you need."],["02","Assessment","We review your position, systems and obligations."],["03","Strategy","We shape a practical plan with clear priorities."],["04","Ongoing support","We manage, analyse and improve continuously."]].map(([n,t,d]) => <li key={n}><b>{n}</b><span/><h3>{t}</h3><p>{d}</p></li>)}</ol></section>

      <section className="section about-section" id="about"><div className="about-quote"><span>“</span><blockquote>More than accountants.<br/>Your financial partners.</blockquote><p>We pair technical depth with commercial judgement, helping leaders move from uncertainty to well-informed action.</p></div><div className="about-story"><p className="eyebrow"><span/>About Rozan</p><h2>Built for businesses that expect more from their numbers.</h2><p>Rozan is built on a simple belief: accurate accounts are the beginning of a useful conversation, not the end. We translate financial information into clear priorities and durable progress.</p><div className="values"><div><strong>Clear</strong><span>Direct advice without unnecessary complexity.</span></div><div><strong>Exacting</strong><span>Careful work, reviewed and documented.</span></div><div><strong>Forward-looking</strong><span>Attention on tomorrow as well as today.</span></div></div></div></section>

      <section className="section insights-section" id="insights"><div className="section-heading"><div><p className="eyebrow"><span/>Insights</p><h2>Financial thinking<br/><em>for decisive leaders.</em></h2></div><p>Practical perspectives from our accounting, tax and advisory teams.</p></div><div className="insight-grid">{[["Tax planning","Five decisions to make before year-end","6 min read"],["Cash flow","The working-capital signals worth watching","8 min read"],["Business growth","When your finance function needs to evolve","5 min read"]].map(([category,title,read], i)=><article key={title}><div className={`insight-art art-${i+1}`}><span>ROZAN / INSIGHT</span></div><small>{category}</small><h3>{title}</h3><p>{read}</p><button className="insight-contact" onClick={() => openFlow("quote")}>Discuss this topic <ArrowRight size={15}/></button></article>)}</div></section>

      <section className="section faq-section"><div><p className="eyebrow"><span/>Frequently asked</p><h2>Good questions.<br/><em>Clear answers.</em></h2><p>If your question is more specific, our team will be glad to help.</p><button className="text-link" onClick={() => openFlow("book")}>Talk to an accountant</button></div><Accordion type="single" collapsible className="faq-list">{faqs.map(([q,a],i)=><AccordionItem value={`item-${i}`} key={q}><AccordionTrigger>{q}</AccordionTrigger><AccordionContent>{a}</AccordionContent></AccordionItem>)}</Accordion></section>

      <section className="cta-section" id="contact"><p className="eyebrow light"><span/>Let’s begin</p><h2>Make your next decision<br/>with greater confidence.</h2><p>Tell us where the business is today. We’ll help you see what the numbers say—and what to do next.</p><div><button className="button ivory" onClick={() => openFlow("book")}>Book a consultation</button><button className="outline-button" onClick={() => openFlow("quote")}>Request a quote</button></div></section>

      <footer><div className="footer-brand"><Link className="brand inverse" href="#top"><span className="brand-mark">R</span><span><strong>ROZAN</strong><small>Accounting &amp; Advisory</small></span></Link><p>Clarity for your numbers.<br/>Confidence for your business.</p><span>Nairobi · Kenya</span></div>{[["Company",["About","Contact"]],["Services",["Services","Industries"]],["Resources",["Insights","Client portal"]],["Account",["Login"]]].map(([title,links])=><div className="footer-column" key={String(title)}><strong>{title}</strong>{(links as string[]).map(link=><Link href={({About:"#about",Contact:"#contact",Services:"#services",Industries:"#industries",Insights:"#insights","Client portal":"/portal",Login:"/login"} as Record<string,string>)[link]} key={link}>{link}</Link>)}</div>)}<div className="footer-bottom"><span>© 2026 Rozan Accounting &amp; Advisory</span><span>Secure client and admin workspaces</span></div></footer>

      <Dialog open={!!serviceDetail} onOpenChange={(open) => !open && setServiceDetail(null)}><DialogContent className="service-dialog"><DialogHeader><DialogTitle>{serviceDetail?.title}</DialogTitle><DialogDescription>{serviceDetail?.text}</DialogDescription></DialogHeader><div className="dialog-benefits">{serviceDetail?.benefits.map(b=><span key={b}><Check size={16}/>{b}</span>)}</div><p>Every engagement begins with a practical assessment of your current systems, reporting needs and growth priorities.</p><button className="button" onClick={() => { const name=serviceDetail?.title||""; setServiceDetail(null); openFlow("book",name); }}>Discuss this service</button></DialogContent></Dialog>

      <Dialog open={flow !== null} onOpenChange={(open) => !open && setFlow(null)}>
        <DialogContent className="intake-dialog">
          {complete ? <Confirmation type={flow}/> : <form onSubmit={submit}>
            <DialogHeader><p className="modal-kicker">{flow === "quote" ? "Request a tailored proposal" : "Book a consultation"}</p><DialogTitle>{flow === "quote" ? "Tell us what the business needs." : "Let’s start with the right conversation."}</DialogTitle><DialogDescription>Step {step} of 3 · Your information is treated confidentially.</DialogDescription></DialogHeader>
            <div className="step-track"><span className={step>=1?"active":""}/><span className={step>=2?"active":""}/><span className={step>=3?"active":""}/></div>
            {step===1 && <div className="form-grid"><label className="full">Service<Select value={form.service} onValueChange={(v)=>update("service",v)}><SelectTrigger><SelectValue placeholder="Choose a service"/></SelectTrigger><SelectContent>{services.map(s=><SelectItem value={s.title} key={s.title}>{s.title}</SelectItem>)}</SelectContent></Select></label>{flow==="quote" && <><label>Industry<input required value={form.industry} onChange={e=>update("industry",e.target.value)} placeholder="e.g. Technology"/></label><label>Business size<input value={form.size} onChange={e=>update("size",e.target.value)} placeholder="e.g. 10–25 people"/></label></>}<label className="full">What would you like help with?{flow==="book" && <small> (optional)</small>}<textarea required={flow==="quote"} value={form.details} onChange={e=>update("details",e.target.value)} placeholder="Share the current challenge, deadline or decision ahead."/></label></div>}
            {step===2 && <div className="form-grid"><label>Preferred date<input required={flow==="book"} min={flow==="book"?todayForDateInput():undefined} type="date" value={form.date} onChange={e=>flow === "book" ? updateBookingDate(e.target.value) : update("date",e.target.value)}/></label><label>Preferred time<Select value={form.time} onValueChange={(v)=>update("time",v)} disabled={flow==="book" && (!form.date || slotsLoading)}><SelectTrigger><SelectValue placeholder={slotsLoading?"Loading times…":"Choose a time"}/></SelectTrigger><SelectContent>{(flow==="book"?slots:["Morning","Afternoon"]).map(t=><SelectItem value={t} key={t}>{t}</SelectItem>)}</SelectContent></Select>{flow==="book" && form.date && !slotsLoading && slots.length===0 && <small className="availability-note">No times are available on this date. Choose another day.</small>}</label><label className="full">Meeting format<Select value={form.meeting} onValueChange={(v)=>update("meeting",v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Video call","Phone call","In-person"].map(t=><SelectItem value={t} key={t}>{t}</SelectItem>)}</SelectContent></Select></label></div>}
            {step===3 && <div className="form-grid"><label>Your name<input required value={form.name} onChange={e=>update("name",e.target.value)} placeholder="Full name"/></label><label>Work email<input required type="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="you@company.com"/></label><label>Phone<input required value={form.phone} onChange={e=>update("phone",e.target.value)} placeholder="+254 ..."/></label><label>Company<input required value={form.company} onChange={e=>update("company",e.target.value)} placeholder="Business name"/></label></div>}
            <div className="form-actions">{step>1?<button type="button" className="back-button" onClick={()=>setStep(step-1)}>Back</button>:<span/>}{step<3?<button type="button" className="button" onClick={continueFlow}>Continue <ArrowRight size={16}/></button>:<button className="button" disabled={sending}>{sending?"Sending…":flow==="quote"?"Request proposal":"Request consultation"}</button>}</div>
          </form>}
        </DialogContent>
      </Dialog>
      <InquiryAgent onStartInquiry={(nextFlow, service = "") => openFlow(nextFlow, service)} />
    </main>
  );
}

function Confirmation({ type }: { type: Flow }) {
  return <div className="confirmation"><span><Check/></span><p className="modal-kicker">Request received</p><DialogTitle>{type==="quote"?"Your proposal request is with our team.":"Your consultation request is confirmed."}</DialogTitle><DialogDescription>We’ll review the details and reply with the next available options. A reference has been saved securely.</DialogDescription></div>;
}

function todayForDateInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
