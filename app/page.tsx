"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, Bell, BookOpen, Bot, Check, CheckCircle2, ChevronRight, Clock3, FileSearch, Gauge, GitBranch, Inbox, LayoutDashboard, ListFilter, LockKeyhole, Menu, Plus, Search, Settings, ShieldCheck, Sparkles, TerminalSquare, ThumbsDown, ThumbsUp, TimerReset, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type Severity = "critical" | "high" | "medium" | "low";
type IncidentStatus = "Investigating" | "Needs approval" | "Resolved";
type Incident = { id: string; title: string; customer: string; severity: Severity; status: IncidentStatus; age: string; source: string; summary: string; confidence: number; evidence: { source: string; detail: string; relevance: number }[]; actions: string[]; };
type AuditEvent = { id: string; incidentId: string; eventType: string; detail: string; createdAt: string | number };
type AnalysisMode = "demo" | "live";

const incidents: Incident[] = [
  { id: "INC-2841", title: "Payment failures after checkout release", customer: "Northstar Retail", severity: "critical", status: "Needs approval", age: "8 min", source: "API monitor", summary: "The new checkout service is sending an unsupported currency field to the payment gateway. Failures began four minutes after release 7f31c2 and affect GBP and EUR orders.", confidence: 94, evidence: [{ source: "gateway-errors.log", detail: "422 UNSUPPORTED_CURRENCY increased from 0.2% to 31.8%", relevance: 98 }, { source: "Deploy 7f31c2", detail: "Added settlement_currency to PaymentIntent payload", relevance: 95 }, { source: "Incident INC-2519", detail: "Same gateway rejected non-USD settlement fields", relevance: 89 }], actions: ["Roll back checkout-service release 7f31c2", "Notify the payments on-call channel", "Open a follow-up issue for currency validation"] },
  { id: "INC-2838", title: "Login loop for invited workspace users", customer: "Helio Labs", severity: "high", status: "Investigating", age: "24 min", source: "Support ticket", summary: "Invited users with mixed-case email addresses are redirected back to sign-in because membership lookup is case-sensitive.", confidence: 87, evidence: [{ source: "auth-worker traces", detail: "Membership query returned zero rows for mixed-case address", relevance: 94 }, { source: "KB-104", detail: "Email identity must be normalized before lookup", relevance: 91 }, { source: "Ticket #9192", detail: "Three affected users confirmed the same redirect loop", relevance: 82 }], actions: ["Normalize email before membership query", "Expire affected sign-in sessions", "Reply to impacted customers"] },
  { id: "INC-2834", title: "CSV exports missing timezone offset", customer: "Aperture Data", severity: "medium", status: "Investigating", age: "1h 12m", source: "Customer email", summary: "The export worker serializes timestamps in server time instead of each workspace timezone. Source data remains correct.", confidence: 82, evidence: [{ source: "export-worker.ts", detail: "Date formatter receives no workspace timezone", relevance: 96 }, { source: "Customer sample.csv", detail: "Every timestamp is shifted by exactly five hours", relevance: 90 }, { source: "Release notes 4.8", detail: "Timezone refactor changed the export formatter", relevance: 78 }], actions: ["Patch timezone parameter", "Regenerate the affected export", "Add a regression test"] },
  { id: "INC-2827", title: "Webhook delivery delayed", customer: "Atlas Finance", severity: "low", status: "Resolved", age: "3h 40m", source: "Queue alert", summary: "A temporary worker capacity limit increased webhook latency. The queue has fully recovered.", confidence: 97, evidence: [{ source: "queue metrics", detail: "Backlog peaked at 2,430 jobs and returned to zero", relevance: 99 }, { source: "worker events", detail: "Autoscaling ceiling was reached for eleven minutes", relevance: 94 }, { source: "Status page", detail: "Recovery confirmed at 09:42 UTC", relevance: 88 }], actions: ["Raise worker ceiling", "Close incident", "Share post-incident note"] },
];

const severityStyles: Record<Severity, string> = { critical: "border-rose-400/20 bg-rose-400/10 text-rose-300", high: "border-orange-400/20 bg-orange-400/10 text-orange-300", medium: "border-amber-300/20 bg-amber-300/10 text-amber-200", low: "border-sky-400/20 bg-sky-400/10 text-sky-300" };
const traceSteps = [{ label: "Ticket classified", detail: "Payments · Critical", icon: ListFilter }, { label: "Knowledge searched", detail: "24 documents · 3 matched", icon: FileSearch }, { label: "Logs correlated", detail: "Release 7f31c2 identified", icon: GitBranch }, { label: "Resolution planned", detail: "3 guarded actions ready", icon: ShieldCheck }];

function ScoreRing({ value }: { value: number }) { return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{value}%</strong><span>confidence</span></div></div>; }

export default function Home() {
  const [selectedId, setSelectedId] = useState(incidents[0].id);
  const [incidentList, setIncidentList] = useState<Incident[]>(incidents);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(traceSteps.length);
  const [approved, setApproved] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newIncident, setNewIncident] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState("overview");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [savingIncident, setSavingIncident] = useState(false);
  const [analysisModes, setAnalysisModes] = useState<Record<string, AnalysisMode>>({});
  const current = incidentList.find((item) => item.id === selectedId) ?? incidentList[0];
  const filtered = useMemo(() => incidentList.filter((item) => `${item.id} ${item.title} ${item.customer}`.toLowerCase().includes(query.toLowerCase())), [query, incidentList]);

  const loadAudit = async () => { try { const response = await fetch("/api/events"); const data = await response.json() as { events?: AuditEvent[] }; if (response.ok && data.events) setAuditEvents(data.events); } catch { /* The primary workflow remains usable if history is unavailable. */ } };
  const recordAudit = async (incidentId: string, eventType: string, detail: string) => { try { const response = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId, eventType, detail }) }); if (response.ok) await loadAudit(); } catch { /* Keep the action usable and report storage only when explicitly requested. */ } };
  const analyze = async (target = current) => {
    setRunning(true); setApproved(false); setRunStep(0);
    const request = fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) });
    for (let step = 1; step <= traceSteps.length; step += 1) { await new Promise((resolve) => window.setTimeout(resolve, 520)); setRunStep(step); }
    try {
      const response = await request;
      const data = await response.json() as { analysis?: Pick<Incident, "summary" | "confidence" | "evidence" | "actions">; mode?: AnalysisMode; code?: string; error?: string; model?: string };
      if (response.ok && data.analysis) {
        const result = data.analysis;
        setIncidentList((items) => items.map((item) => item.id === target.id ? { ...item, ...result } : item));
        setAnalysisModes((modes) => ({ ...modes, [target.id]: "live" }));
        void recordAudit(target.id, "analysis.completed", `${result.confidence}% live-model confidence; ${result.evidence.length} grounded sources`);
        toast.success("Live investigation complete", { description: `${result.confidence}% confidence with ${result.evidence.length} grounded sources.` });
        return { ...target, ...result };
      }
      if (data.code === "provider_not_configured") {
        setAnalysisModes((modes) => ({ ...modes, [target.id]: "demo" }));
        void recordAudit(target.id, "analysis.demo", "Provider not configured; retained portfolio demo analysis");
        toast.info("Demo analysis complete", { description: "Connect the model provider to run a live AI investigation." });
        return target;
      }
      throw new Error(data.error || "The live analysis could not be completed");
    } catch (error) {
      void recordAudit(target.id, "analysis.failed", error instanceof Error ? error.message : "Unknown analysis error");
      toast.error("Analysis unavailable", { description: error instanceof Error ? error.message : "Try again in a moment." });
      return target;
    } finally { setRunning(false); }
  };
  const approve = () => { setApproved(true); void recordAudit(current.id, "actions.approved", current.actions.join(" | ")); toast.success("Rollback approved", { description: "Action recorded in the incident audit trail." }); };
  const createIncident = async () => {
    if (newIncident.trim().length < 12) { toast.error("Add a little more detail before creating the incident."); return; }
    setSavingIncident(true);
    try {
      const response = await fetch("/api/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: newIncident }) });
      const data = await response.json() as { incident?: { id: string; title: string; description: string; customer: string; severity: Severity; status: IncidentStatus } ; error?: string };
      if (!response.ok || !data.incident) throw new Error(data.error || "Could not save incident");
      const saved = data.incident;
      const item: Incident = { id: saved.id, title: saved.title, customer: saved.customer, severity: saved.severity, status: saved.status, age: "now", source: "Manual report", summary: saved.description, confidence: 76, evidence: [{ source: "Submitted report", detail: saved.description, relevance: 100 }, { source: "Triage policy", detail: "Incident requires log and deployment correlation before action.", relevance: 74 }], actions: ["Collect related service logs", "Check the latest deployment", "Notify the responsible service owner"] };
      setIncidentList((items) => [item, ...items]); setSelectedId(item.id); setWorkspaceTab("overview"); setDialogOpen(false); setNewIncident(""); await loadAudit();
      toast.success("Incident created", { description: `${item.id} was saved and queued for triage.` });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save incident"); }
    finally { setSavingIncident(false); }
  };

  useEffect(() => {
    const loadPersistentState = async () => {
      try {
        const response = await fetch("/api/incidents");
        const data = await response.json() as { incidents?: Array<{ id: string; title: string; description: string; customer: string; severity: Severity; status: IncidentStatus; createdAt: string | number }> };
        if (response.ok && data.incidents?.length) {
          const savedItems: Incident[] = data.incidents.map((saved) => ({ id: saved.id, title: saved.title, customer: saved.customer, severity: saved.severity, status: saved.status, age: "saved", source: "Manual report", summary: saved.description, confidence: 76, evidence: [{ source: "Submitted report", detail: saved.description, relevance: 100 }, { source: "Triage policy", detail: "Incident requires log and deployment correlation before action.", relevance: 74 }], actions: ["Collect related service logs", "Check the latest deployment", "Notify the responsible service owner"] }));
          setIncidentList([...savedItems, ...incidents]);
        }
      } catch { /* Seed incidents remain available during a storage outage. */ }
      await loadAudit();
    };
    void loadPersistentState();
  }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool?.({ name: "list_incidents", title: "List incidents", description: "Return the active ResolveOps incident queue and current status.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: async () => incidentList.map(({ id, title, severity, status }) => ({ id, title, severity, status })) }, { signal: lifecycle.signal });
      await modelContext.registerTool?.({ name: "start_incident_analysis", title: "Analyze incident", description: "Select an incident and start its visible evidence-backed analysis.", inputSchema: { type: "object", properties: { incidentId: { type: "string" } }, required: ["incidentId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: { incidentId?: string }) => { const match = incidentList.find((item) => item.id === input?.incidentId); if (!match) throw new Error("Unknown incident ID"); setSelectedId(match.id); await analyze(match); return { incidentId: match.id, confidence: match.confidence, evidenceCount: match.evidence.length }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [incidentList]);

  return <div className="app-shell">
    <Toaster position="top-right" richColors />
    <aside className={`side-rail ${mobileNav ? "mobile-open" : ""}`}>
      <div className="brand-mark"><span className="brand-symbol"><Activity /></span><span>ResolveOps <b>AI</b></span></div>
      <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
      <nav aria-label="Primary navigation">
        <button className="nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><LayoutDashboard />Command center</button><button className="nav-item" onClick={() => document.querySelector(".queue-panel")?.scrollIntoView({ behavior: "smooth" })}><Inbox />Incidents<span className="nav-count">{incidentList.length}</span></button><button className="nav-item" onClick={() => { setWorkspaceTab("evidence"); document.querySelector(".incident-workspace")?.scrollIntoView({ behavior: "smooth" }); }}><BookOpen />Knowledge</button><button className="nav-item" onClick={() => toast.info("Automation controls", { description: "Choose an incident and approve its guarded action plan." })}><Bot />Automations</button><p className="nav-label">Intelligence</p><button className="nav-item" onClick={() => document.querySelector(".eval-summary")?.scrollIntoView({ behavior: "smooth" })}><Gauge />Evaluations</button><button className="nav-item" onClick={() => { setWorkspaceTab("trace"); document.querySelector(".incident-workspace")?.scrollIntoView({ behavior: "smooth" }); }}><TerminalSquare />Traces</button>
      </nav>
      <div className="rail-footer"><div className="workspace-avatar">SY</div><div><strong>Sanaullah Yasir</strong><span>AI Engineer</span></div><Settings /></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><p className="eyebrow">OPERATIONS / LIVE</p><h1>Incident command center</h1></div><div className="top-actions"><div className="system-health"><span />All systems operational</div><Button variant="ghost" size="icon" className="icon-button" aria-label="Notifications"><Bell /></Button><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button className="new-incident"><Plus />New incident</Button></DialogTrigger><DialogContent className="border-white/10 bg-[#101722] text-white sm:max-w-xl"><DialogHeader><DialogTitle>Create an incident</DialogTitle><DialogDescription className="text-slate-400">Paste the customer report or describe the system failure. ResolveOps will save, classify, and queue it.</DialogDescription></DialogHeader><Textarea value={newIncident} onChange={(event) => setNewIncident(event.target.value)} placeholder="Example: Customers in Europe are seeing payment failures after release 7f31c2..." className="min-h-32 border-white/10 bg-black/20 text-white placeholder:text-slate-600" /><DialogFooter><Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={savingIncident} onClick={createIncident} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{savingIncident ? <TimerReset className="animate-spin" /> : <Plus />}{savingIncident ? "Saving…" : "Create and triage"}</Button></DialogFooter></DialogContent></Dialog></div></header>

      <section className="metrics-grid" aria-label="Operations metrics">
        <article className="metric-card"><div><span>Open incidents</span><strong>{incidentList.filter((item) => item.status !== "Resolved").length}</strong></div><div className="metric-icon coral"><AlertTriangle /></div><p><b>{incidentList.filter((item) => item.severity === "critical").length} critical</b> need attention</p></article>
        <article className="metric-card"><div><span>Auto-resolution</span><strong>71%</strong></div><div className="metric-icon mint"><Zap /></div><p><b>+8.4%</b> from last week</p></article>
        <article className="metric-card"><div><span>Median response</span><strong>1m 42s</strong></div><div className="metric-icon blue"><Clock3 /></div><p><b>38s faster</b> than target</p></article>
        <article className="metric-card eval-card"><div className="eval-head"><span>Evaluation score</span><Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-200">v2.4</Badge></div><div className="eval-score"><strong>91.8</strong><span>/ 100</span></div><Progress value={91.8} className="bg-white/10 [&_[data-slot=progress-indicator]]:bg-cyan-300" /></article>
      </section>

      <section className="workspace-grid">
        <div className="queue-panel panel"><div className="panel-heading"><div><p className="eyebrow">QUEUE</p><h2>Active incidents</h2></div><Button variant="ghost" size="icon" className="icon-button"><ListFilter /></Button></div><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incidents" /></label><div className="incident-list">{filtered.map((incident) => <button key={incident.id} onClick={() => { setSelectedId(incident.id); setApproved(false); setRunStep(traceSteps.length); }} className={`incident-row ${selectedId === incident.id ? "selected" : ""}`}><span className={`severity-dot ${incident.severity}`} /><span className="incident-copy"><span className="incident-meta"><b>{incident.id}</b><small>{incident.age}</small></span><strong>{incident.title}</strong><small>{incident.customer}</small></span><ChevronRight /></button>)}{filtered.length === 0 && <div className="empty-queue"><Search /><p>No incidents match “{query}”.</p></div>}</div></div>

        <div className="incident-workspace panel"><div className="incident-header"><div><div className="incident-kicker"><Badge variant="outline" className={severityStyles[current.severity]}>{current.severity}</Badge><span>{current.id}</span><span>·</span><span>{current.source}</span></div><h2>{current.title}</h2><p>{current.customer} · Reported {current.age} ago</p></div><Button onClick={() => analyze()} disabled={running} className="analyze-button">{running ? <TimerReset className="animate-spin" /> : <Sparkles />}{running ? "Investigating…" : "Run analysis"}</Button></div>
          <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="workspace-tabs"><TabsList variant="line" className="tab-list"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="evidence">Evidence <span className="tab-count">{current.evidence.length}</span></TabsTrigger><TabsTrigger value="trace">Trace</TabsTrigger><TabsTrigger value="activity">Activity <span className="tab-count">{auditEvents.filter((event) => event.incidentId === current.id).length}</span></TabsTrigger></TabsList>
            <TabsContent value="overview" className="tab-content"><section className="diagnosis-card"><div className="diagnosis-top"><div><p className="eyebrow"><Bot />AI DIAGNOSIS <span className={`model-mode ${analysisModes[current.id] === "live" ? "live" : "demo"}`}>{analysisModes[current.id] === "live" ? "Live model" : "Demo engine"}</span></p><h3>Probable root cause identified</h3></div><ScoreRing value={current.confidence} /></div><p>{current.summary}</p><div className="source-links">{current.evidence.map((item, index) => <button key={item.source} onClick={() => toast.info(item.source, { description: item.detail })}><FileSearch />[{index + 1}] {item.source}</button>)}</div></section>
              <section className="plan-card"><div className="section-title"><div><p className="eyebrow">RESOLUTION PLAN</p><h3>Guarded actions</h3></div><span className="approval-label"><LockKeyhole />Human approval required</span></div><ol className="action-list">{current.actions.map((action, index) => <li key={action}><span>{approved ? <Check /> : index + 1}</span><div><strong>{action}</strong><small>{index === 0 ? "Reversible · estimated 45 seconds" : index === 1 ? "Slack integration · draft ready" : "GitHub integration · no code changes"}</small></div></li>)}</ol><div className="approval-bar"><div className="risk-note"><ShieldCheck /><span><strong>Safety check passed</strong><small>No destructive database changes detected</small></span></div><div><Button variant="ghost" onClick={() => toast.info("Plan rejected", { description: "ResolveOps will request a revised action plan." })}><ThumbsDown />Reject</Button><Button onClick={approve} disabled={approved} className="approve-button">{approved ? <CheckCircle2 /> : <ThumbsUp />}{approved ? "Approved" : "Approve actions"}</Button></div></div></section>
            </TabsContent>
            <TabsContent value="evidence" className="tab-content evidence-tab"><div className="section-title"><div><p className="eyebrow">RETRIEVAL RESULTS</p><h3>Evidence with source grounding</h3></div><Badge variant="outline" className="border-emerald-400/20 text-emerald-300"><ShieldCheck />3 verified</Badge></div>{current.evidence.map((item, index) => <article className="evidence-card" key={item.source}><span className="evidence-index">0{index + 1}</span><div><strong>{item.source}</strong><p>{item.detail}</p></div><div className="relevance"><b>{item.relevance}%</b><span>relevance</span></div></article>)}</TabsContent>
            <TabsContent value="trace" className="tab-content trace-tab"><div className="section-title"><div><p className="eyebrow">EXECUTION TRACE</p><h3>Inspectable reasoning pipeline</h3></div><span className="run-id">RUN_94F2A</span></div><div className="trace-list">{traceSteps.map((step, index) => { const Icon = step.icon; const complete = index < runStep; const active = running && index === runStep; return <div className={`trace-row ${complete ? "complete" : ""} ${active ? "active" : ""}`} key={step.label}><span className="trace-node">{complete ? <Check /> : <Icon />}</span><div><strong>{step.label}</strong><small>{complete ? step.detail : active ? "Running…" : "Waiting"}</small></div><span className="trace-time">{complete ? `${0.3 + index * 0.4}s` : "—"}</span></div>; })}</div><div className="trace-stats"><div><span>Latency</span><strong>1.84s</strong></div><div><span>Tokens</span><strong>2,418</strong></div><div><span>Model cost</span><strong>$0.014</strong></div><div><span>Tool calls</span><strong>4</strong></div></div></TabsContent>
            <TabsContent value="activity" className="tab-content activity-tab"><div className="section-title"><div><p className="eyebrow">AUDIT HISTORY</p><h3>Recorded actions for {current.id}</h3></div><Badge variant="outline" className="border-cyan-300/20 text-cyan-200"><ShieldCheck />Persistent</Badge></div><div className="activity-list">{auditEvents.filter((event) => event.incidentId === current.id).map((event) => <article key={event.id}><span className="activity-icon"><Activity /></span><div><strong>{event.eventType.replaceAll(".", " ")}</strong><p>{event.detail}</p></div><time>{new Date(event.createdAt).toLocaleString()}</time></article>)}{auditEvents.filter((event) => event.incidentId === current.id).length === 0 && <div className="activity-empty"><Activity /><strong>No recorded actions yet</strong><p>Run an analysis or approve an action to create the first audit event.</p></div>}</div></TabsContent>
          </Tabs>
        </div>

        <aside className="insights-panel"><section className="panel health-card"><div className="panel-heading"><div><p className="eyebrow">LIVE SIGNALS</p><h2>System health</h2></div><Activity /></div><div className="service-list"><div><span><i className="healthy" />Checkout API</span><b>99.2%</b></div><div><span><i className="warning" />Payment gateway</span><b>68.1%</b></div><div><span><i className="healthy" />Auth service</span><b>99.9%</b></div><div><span><i className="healthy" />Job workers</span><b>98.7%</b></div></div><button className="text-link">Open service map <ArrowUpRight /></button></section><section className="panel eval-summary"><div className="panel-heading"><div><p className="eyebrow">QUALITY</p><h2>Last 100 runs</h2></div><Gauge /></div><div className="quality-chart"><div className="chart-bars" aria-label="Evaluation trend"><span style={{height:"52%"}} /><span style={{height:"61%"}} /><span style={{height:"58%"}} /><span style={{height:"72%"}} /><span style={{height:"68%"}} /><span style={{height:"82%"}} /><span style={{height:"91%"}} /></div><div className="chart-score"><strong>91.8%</strong><span>grounded accuracy</span></div></div><div className="quality-metrics"><div><span>Citation precision</span><b>94%</b></div><div><span>Action success</span><b>89%</b></div><div><span>Human acceptance</span><b>86%</b></div></div></section><section className="security-note"><ShieldCheck /><div><strong>Guardrails active</strong><p>Prompt injection scan and approval gates are protecting every run.</p></div></section></aside>
      </section>
    </main>
  </div>;
}
