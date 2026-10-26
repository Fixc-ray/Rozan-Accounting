"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowRight, LoaderCircle, MessageCircle, Send, Sparkles, Square, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { RozanInquiryMessage } from "@/lib/ai/rozan-inquiry-agent";

type InquiryAgentProps = {
  onStartInquiry: (flow: "book" | "quote", service?: string) => void;
};

const starterQuestions = [
  "What bookkeeping service do I need?",
  "Can you help with tax planning?",
  "How often should my books be updated?",
];

export function InquiryAgent({ onStartInquiry }: InquiryAgentProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/inquiry-agent" }), []);
  const { messages, sendMessage, status, error, clearError, stop } = useChat<RozanInquiryMessage>({ transport, throttle: 40 });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    clearError();
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(input);
  };

  const startInquiry = (flow: "book" | "quote", service = "") => {
    setOpen(false);
    onStartInquiry(flow, service);
  };

  return (
    <aside className={`inquiry-agent ${open ? "open" : ""}`} aria-label="Rozan digital adviser">
      {open && (
        <section className="agent-panel" role="dialog" aria-modal="false" aria-labelledby="agent-title">
          <header className="agent-header">
            <span className="agent-avatar"><Sparkles /></span>
            <div><strong id="agent-title">Rozan accounting adviser</strong><small><i /> Accounting questions only</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close adviser"><X /></button>
          </header>

          <div className="agent-messages" aria-live="polite">
            <div className="agent-welcome">
              <span><Sparkles /></span>
              <div><strong>Welcome to Rozan.</strong><p>Ask me about bookkeeping, tax, payroll, audit, financial reporting, or business finance.</p></div>
            </div>

            {messages.length === 0 && (
              <div className="agent-starters" aria-label="Suggested questions">
                {starterQuestions.map((question) => <button type="button" key={question} onClick={() => send(question)}>{question}<ArrowRight /></button>)}
              </div>
            )}

            {messages.map((message) => (
              <div className={`agent-message ${message.role}`} key={message.id}>
                {message.parts.map((part, index) => {
                  if (part.type === "text") return <p key={`${message.id}-${index}`}>{part.text}</p>;

                  if (part.type === "tool-recommendService" && part.state === "output-available") {
                    return <div className="agent-tool-card" key={`${message.id}-${index}`}><small>Recommended service</small><strong>{part.output.service}</strong><p>{part.output.scope}</p></div>;
                  }

                  if (part.type === "tool-offerNextStep" && part.state === "output-available") {
                    const action = part.output.action;
                    return <div className="agent-next-step" key={`${message.id}-${index}`}><p>{part.output.reason}</p><button type="button" onClick={() => startInquiry(action, part.output.service)}>{part.output.label}<ArrowRight /></button></div>;
                  }

                  return null;
                })}
              </div>
            ))}

            {status === "submitted" && <div className="agent-thinking"><span /><span /><span /><small>Thinking</small></div>}
            {error && <div className="agent-error"><p>I couldn’t answer that accounting question right now. You can still reach the team below.</p><div><button type="button" onClick={() => startInquiry("book")}>Book a consultation</button><button type="button" onClick={() => startInquiry("quote")}>Request a quote</button></div></div>}
            <div ref={messagesEndRef} />
          </div>

          <form className="agent-composer" onSubmit={submit}>
            <input ref={inputRef} value={input} maxLength={2000} onChange={(event) => setInput(event.target.value)} placeholder="Ask an accounting question…" aria-label="Message the accounting adviser" disabled={busy} />
            {busy
              ? <button type="button" onClick={() => void stop()} aria-label="Stop response"><Square /></button>
              : <button type="submit" disabled={!input.trim()} aria-label="Send message"><Send /></button>}
          </form>
          <footer className="agent-footer">AI assistant · Don’t share sensitive financial information</footer>
        </section>
      )}

      <button className="agent-launcher" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? "Close digital adviser" : "Chat with our digital adviser"}>
        {open ? <X /> : <><MessageCircle /><span><strong>Ask Rozan</strong><small>Instant answers</small></span></>}
        {busy && <LoaderCircle className="agent-launcher-loading" />}
      </button>
    </aside>
  );
}
