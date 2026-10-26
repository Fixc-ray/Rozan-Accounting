import { createAgentUIStreamResponse, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { rozanInquiryAgent } from "@/lib/ai/rozan-inquiry-agent";

export const maxDuration = 30;

const WINDOW_MS = 10 * 60 * 1000;
const REQUESTS_PER_WINDOW = 20;
const MAX_MESSAGES = 24;
const MAX_TEXT_LENGTH = 2_000;
const MAX_TOTAL_TEXT_LENGTH = 12_000;

type RateBucket = { count: number; resetAt: number };
const globalRateLimits = globalThis as typeof globalThis & {
  __rozanAgentRateLimits?: Map<string, RateBucket>;
};
const rateLimits = globalRateLimits.__rozanAgentRateLimits ??= new Map<string, RateBucket>();

export async function POST(request: Request) {
  const clientId = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";

  if (!withinRateLimit(clientId)) {
    return Response.json(
      { error: "Too many messages. Please wait a few minutes or use the inquiry form." },
      { status: 429, headers: { "Retry-After": String(WINDOW_MS / 1000) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages = readMessages(body);
  if (!messages) {
    return Response.json({ error: "The conversation is too large or invalid." }, { status: 400 });
  }

  const latestText = latestUserText(messages);
  if (!latestText) {
    return Response.json({ error: "A question is required." }, { status: 400 });
  }

  if (isGreeting(latestText)) {
    return staticTextResponse("Hello! I answer accounting questions about bookkeeping, tax, payroll, audit, company formation, financial statements, and business finance. What accounting question can I help you with?");
  }

  if (!isAccountingQuestion(latestText, messages)) {
    return staticTextResponse("I can only help with accounting-related questions. You can ask me about bookkeeping, tax, payroll, audit, company formation, financial statements, cash flow, or other business-accounting matters.");
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return staticTextResponse(accountingFallback(latestText));
  }

  return createAgentUIStreamResponse({
    agent: rozanInquiryAgent,
    uiMessages: messages,
    abortSignal: request.signal,
    timeout: { totalMs: 25_000 },
    onError: (error) => {
      console.error("Inquiry agent stream failed", error);
      return "The digital adviser is temporarily unavailable. Please use the consultation or quote form and the team will respond.";
    },
  });
}

function withinRateLimit(clientId: string) {
  const now = Date.now();
  const current = rateLimits.get(clientId);
  if (!current || current.resetAt <= now) {
    rateLimits.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
  } else if (current.count >= REQUESTS_PER_WINDOW) {
    return false;
  } else {
    current.count += 1;
  }

  if (rateLimits.size > 2_000) {
    for (const [key, bucket] of rateLimits) {
      if (bucket.resetAt <= now) rateLimits.delete(key);
    }
  }
  return true;
}

function readMessages(body: unknown) {
  if (!body || typeof body !== "object" || !("messages" in body)) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return null;

  let totalTextLength = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object") return null;
    const parts = (message as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return null;
    for (const part of parts) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) return null;
        totalTextLength += text.length;
        if (totalTextLength > MAX_TOTAL_TEXT_LENGTH) return null;
      }
    }
  }
  return messages;
}

function latestUserText(messages: unknown[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: unknown; parts?: unknown[] };
    if (message.role !== "user" || !Array.isArray(message.parts)) continue;
    return message.parts
      .filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string")
      .map((part) => part.text)
      .join(" ")
      .trim();
  }
  return "";
}

const accountingTerms = /\b(account(?:ing|ant|s)?|bookkeep(?:ing|er)?|tax(?:ation|es)?|kra|vat|paye|payroll|audit(?:or|ing)?|finance|financial|cash[ -]?flow|invoice|expense|revenue|profit|loss|balance[ -]?sheet|income[ -]?statement|ledger|journal entr(?:y|ies)|reconcil(?:e|iation)|receivable|payable|compliance|company formation|business registration|budget|costing|depreciation|asset|liabilit(?:y|ies)|equity|inventory|capital|dividend|statutory|nssf|shif|withholding|turnover|margin|forecast|management account|annual return|filing|books|pricing|price|fee|quote|service|consultation)\b/i;
const greetingTerms = /^(hi|hello|hey|good morning|good afternoon|good evening|howdy)[!. ]*$/i;

function isGreeting(text: string) {
  return greetingTerms.test(text.trim());
}

function isAccountingQuestion(text: string, messages: unknown[]) {
  if (accountingTerms.test(text)) return true;
  const shortFollowUp = text.trim().split(/\s+/).length <= 8;
  if (!shortFollowUp) return false;
  const priorUserContext = messages.slice(0, -1).map((message) => latestUserText([message])).join(" ");
  return accountingTerms.test(priorUserContext);
}

function accountingFallback(text: string) {
  const normalized = text.toLowerCase();
  if (/\b(price|pricing|fee|cost|quote)\b/.test(normalized)) {
    return "Accounting fees depend on transaction volume, reporting requirements, business complexity, and the services you need. Rozan agrees a clear scope and proposal before work begins. Use “Request a quote” on this page for a tailored estimate.";
  }
  if (/\b(tax|kra|vat|paye|withholding|filing|compliance)\b/.test(normalized)) {
    return "Rozan supports tax planning, corporate tax, VAT and PAYE matters, compliance reviews, and filing preparation. Exact obligations depend on your business and current records, so a tax adviser should review the facts before giving a definitive answer.";
  }
  if (/\b(payroll|salary|wage|nssf|shif)\b/.test(normalized)) {
    return "Rozan can manage recurring payroll, employee records, deductions, statutory reporting, and year-end requirements. For an accurate setup, the team will review your headcount, pay cycle, benefits, and current payroll records.";
  }
  if (/\b(audit|assurance|internal control)\b/.test(normalized)) {
    return "Rozan provides financial audits, internal-control reviews, and compliance assurance. The appropriate engagement depends on the reporting purpose, stakeholders, records available, and any regulatory requirements.";
  }
  if (/\b(company formation|business registration|register|incorporat)\b/.test(normalized)) {
    return "Rozan can help with business registration, entity structuring, and setting up the accounting systems a new company needs. The right structure depends on ownership, operations, tax considerations, and growth plans.";
  }
  if (/\b(cash[ -]?flow|forecast|budget|profit|margin|advisory)\b/.test(normalized)) {
    return "Business advisory support can cover cash-flow planning, budgets, margin analysis, forecasts, and growth modelling. Rozan starts by reviewing your current figures and the decision you need to make.";
  }
  if (/\b(balance[ -]?sheet|income[ -]?statement|financial statement)\b/.test(normalized)) {
    return "A balance sheet shows assets, liabilities, and equity at a point in time. An income statement shows revenue, expenses, and profit or loss over a period. Rozan can prepare and explain both as part of management accounts or year-end reporting.";
  }
  if (/\b(double[ -]?entry|trial balance|journal entr(?:y|ies)|ledger)\b/.test(normalized)) {
    return "Double-entry bookkeeping records every transaction with equal debits and credits. Journals capture the entries, the ledger groups them by account, and the trial balance checks that total debits equal total credits before financial statements are prepared.";
  }
  if (/\b(accrual|cash basis)\b/.test(normalized)) {
    return "Cash-basis accounting records income and expenses when money changes hands. Accrual accounting records them when they are earned or incurred, giving a fuller view of performance and obligations. The appropriate basis depends on reporting and tax requirements.";
  }
  if (/\b(working capital)\b/.test(normalized)) {
    return "Working capital is current assets minus current liabilities. It indicates whether a business can cover near-term obligations, but its quality also depends on how quickly inventory and receivables convert into cash.";
  }
  if (/\b(asset|liabilit(?:y|ies)|equity)\b/.test(normalized)) {
    return "Assets are resources the business controls, liabilities are obligations it owes, and equity is the owners’ residual interest. They are linked by the accounting equation: Assets = Liabilities + Equity.";
  }
  if (/\b(depreciation)\b/.test(normalized)) {
    return "Depreciation spreads the cost of a long-term asset over its useful life. The method and useful life should reflect the asset and the applicable reporting and tax rules, which may treat depreciation differently.";
  }
  if (/\b(bookkeep(?:ing|er)?|books|records|reconcil(?:e|iation)|invoice|receivable|payable|expense|account)\b/.test(normalized)) {
    return "Rozan provides bookkeeping, reconciliations, management accounts, financial statements, and accounts-payable and receivable oversight. Most growing businesses benefit from monthly updates, while higher-volume businesses may need weekly processing.";
  }
  return "I can help with that accounting topic. Please add a little more detail and tell me whether it concerns bookkeeping, tax, payroll, audit, financial statements, cash flow, or another business-accounting matter.";
}

function staticTextResponse(text: string) {
  const textId = crypto.randomUUID();
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute({ writer }) {
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: text });
        writer.write({ type: "text-end", id: textId });
        writer.setOutcome({ status: "completed" });
      },
    }),
  });
}
