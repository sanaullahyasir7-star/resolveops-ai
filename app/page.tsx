"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, Bell, BookOpen, Bot, CheckCircle2, ChevronRight, Clock3, FileSearch, Gauge, GitBranch, Inbox, LayoutDashboard, ListFilter, LockKeyhole, Menu, Plus, Search, Settings, ShieldCheck, Sparkles, TerminalSquare, ThumbsDown, ThumbsUp, TimerReset, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type Severity = "critical" | "high" | "medium" | "low";
type IncidentStatus = "Investigating" | "Needs approval" | "Resolved";
type Incident = { id: string; title: string; customer: string; severity: Severity; status: IncidentStatus; age: string; source: string; summary: string; confidence: number; evidence: { source: string; detail: string; relevance: number }[]; actions: string[]; };
type AuditEvent = { id: string; incidentId: string; eventType: string; detail: string; createdAt: string | number };
type AnalysisMode = "unavailable" | "live";

const incidents: Incident[] = [
  { id: "INC-2841", title: "Payment failures after checkout release", customer: "Northstar Retail", severity: "critical", status: "Needs approval", age: "8 min", source: "API monitor", summary: "The new checkout service is sending an unsupported currency field to the payment gateway. Failures began four minutes after release 7f31c2 and affect GBP and EUR orders.", confidence: 94, evidence: [{ source: "gateway-errors.log", detail: "422 UNSUPPORTED_CURRENCY increased from 0.2% to 31.8%", relevance: 98 }, { source: "Deploy 7f31c2", detail: "Added settlement_currency to PaymentIntent payload", relevance: 95 }, { source: "Incident INC-2519", detail: "Same gateway rejected non-USD settlement fields", relevance: 89 }], actions: ["Roll back checkout-service release 7f31c2", "Notify the payments on-call channel", "Open a follow-up issue for currency validation"] },
  { id: "INC-2838", title: "Login loop for invited workspace users", customer: "Helio Labs", severity: "high", status: "Investigating", age: "24 min", source: "Support ticket", summary: "Invited users with mixed-case email addresses are redirected back to sign-in because membership lookup is case-sensitive.", confidence: 87, evidence: [{ source: "auth-worker traces", detail: "Membership query returned zero rows for mixed-case address", relevance: 94 }, { source: "KB-104", detail: "Email identity must be normalized before lookup", relevance: 91 }, { source: "Ticket #9192", detail: "Three affected users confirmed the same redirect loop", relevance: 82 }], actions: ["Normalize email before membership query", "Expire affected sign-in sessions", "Reply to impacted customers"] },
  { id: "INC-2834", title: "CSV exports missing timezone offset", customer: "Aperture Data", severity: "medium", status: "Investigating", age: "1h 12m", source: "Customer email", summary: "The export worker serializes timestamps in server time instead of each workspace timezone. Source data remains correct.", confidence: 82, evidence: [{ source: "export-worker.ts", detail: "Date formatter receives no workspace timezone", relevance: 96 }, { source: "Customer sample.csv", detail: "Every timestamp is shifted by exactly five hours", relevance: 90 }, { source: "Release notes 4.8", detail: "Timezone refactor changed the export formatter", relevance: 78 }], actions: ["Patch timezone parameter", "Regenerate the affected export", "Add a regression test"] },
  { id: "INC-2827", title: "Webhook delivery delayed", customer: "Atlas Finance", severity: "low", status: "Resolved", age: "3h 40m", source: "Queue alert", summary: "A temporary worker capacity limit increased webhook latency. The queue has fully recovered.", confidence: 97, evidence: [{ source: "queue metrics", detail: "Backlog peaked at 2,430 jobs and returned to zero", relevance: 99 }, { source: "worker events", detail: "Autoscaling ceiling was reached for eleven minutes", relevance: 94 }, { source: "Status page", detail: "Recovery confirmed at 09:42 UTC", relevance: 88 }], actions: ["Raise worker ceiling", "Close incident", "Share post-incident note"] },
];

const severityStyles: Record<Severity, string> = { critical: "border-rose-400/20 bg-rose-400/10 text-rose-300", high: "border-orange-400/20 bg-orange-400/10 text-orange-300", medium: "border-amber-300/20 bg-amber-300/10 text-amber-200", low: "border-sky-400/20 bg-sky-400/10 text-sky-300" };
const traceSteps = [{ label: "Ticket classified", detail: "Payments · Critical", icon: ListFilter }, { label: "Knowledge searched", detail: "24 documents · 3 matched", icon: FileSearch }, { label: "Logs correlated", detail: "Release 7f31c2 identified", icon: GitBranch }, { label: "Resolution planned", detail: "3 guarded actions ready", icon: ShieldCheck }];

function ScoreRing({ value }: { value: number }) { return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}><div><strong>{value ? `${value}%` : "—"}</strong><span>uncalibrated</span></div></div>; }

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
  const [auditUnavailable, setAuditUnavailable] = useState(false);
  const current = incidentList.find((item) => item.id === selectedId) ?? incidentList[0];
  const filtered = useMemo(() => incidentList.filter((item) => `${item.id} ${item.title} ${item.customer}`.toLowerCase().includes(query.toLowerCase())), [query, incidentList]);
  const incidentListRef = useRef(incidentList);
  const analyzeRef = useRef<(target?: Incident) => Promise<Incident>>(async (target) => target ?? current);

  const loadAudit = async () => { try { const response = await fetch("/api/events"); const data = await response.json() as { events?: AuditEvent[] }; if (response.ok && data.events) { setAuditEvents(data.events); setAuditUnavailable(false); } else setAuditUnavailable(true); } catch { setAuditUnavailable(true); } };
  const recordAudit = async (incidentId: string, eventType: string, detail: string) => { try { const response = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId, eventType, detail }) }); if (!response.ok) { setAuditUnavailable(true); return false; } await loadAudit(); return true; } catch { setAuditUnavailable(true); return false; } };
  const analyze = async (target = current) => {
    setRunning(true); setApproved(false); setRunStep(0);
    const request = fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) });
    try {
      const response = await request;
      const data = await response.json() as { analysis?: Pick<Incident, "summary" | "confidence" | "evidence" | "actions">; mode?: AnalysisMode; code?: string; error?: string; model?: string };
      if (response.ok && data.analysis) {
        const result = data.analysis;
        setIncidentList((items) => items.map((item) => item.id === target.id ? { ...item, ...result } : item));
        setAnalysisModes((modes) => ({ ...modes, [target.id]: "live" }));
        setRunStep(traceSteps.length);
        void recordAudit(target.id, "analysis.completed", `Model estimate ${result.confidence}%; ${result.evidence.length} evidence excerpts matched supplied text`);
        toast.success("Analysis complete", { description: `Uncalibrated model estimate: ${result.confidence}%. Evidence excerpts were matched to submitted text, not independently verified.` });
        return { ...target, ...result };
      }
      if (data.code === "provider_not_configured") {
        setAnalysisModes((modes) => ({ ...modes, [target.id]: "unavailable" }));
        setRunStep(0);
        void recordAudit(target.id, "analysis.demo", "No analysis performed: provider is not configured");
        toast.info("Live analysis unavailable", { description: "No new analysis was performed because the model provider is not configured." });
        return target;
      }
      throw new Error(data.error || "The live analysis could not be completed");
    } catch (error) {
      void recordAudit(target.id, "analysis.failed", error instanceof Error ? error.message : "Unknown analysis error");
      setRunStep(0);
      toast.error("Analysis unavailable", { description: error instanceof Error ? error.message : "Try again in a moment." });
      return target;
    } finally { setRunning(false); }
  };
  const approve = async () => { const saved = await recordAudit(current.id, "actions.approved", current.actions.join(" | ")); if (!saved) { toast.error("Approval was not saved", { description: "Audit storage is unavailable; do not rely on this approval." }); return; } setApproved(true); toast.success("Approval recorded", { description: "No external system action was executed." }); };
  const reject = async () => { if (!current.actions.length) return; const saved = await recordAudit(current.id, "actions.rejected", "Recommendation rejected by reviewer"); if (saved) toast.info("Rejection recorded", { description: "No external system action was taken." }); else toast.error("Rejection was not saved", { description: "Audit storage is unavailable." }); };
  const createIncident = async () => {
    if (newIncident.trim().length < 12) { toast.error("Add a little more detail before creating the incident."); return; }
    setSavingIncident(true);
    try {
      const response = await fetch("/api/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: newIncident }) });
      const data = await response.json() as { incident?: { id: string; title: string; description: string; customer: string; severity: Severity; status: IncidentStatus } ; error?: string };
      if (!response.ok || !data.incident) throw new Error(data.error || "Could not save incident");
      const saved = data.incident;
      const item: Incident = { id: saved.id, title: saved.title, customer: saved.customer, severity: saved.severity, status: saved.status, age: "now", source: "Manual report", summary: `Report saved. Run analysis to generate a recommendation.\n\n${saved.description}`, confidence: 0, evidence: [{ source: "Submitted report", detail: saved.description, relevance: 100 }], actions: [] };
      setIncidentList((items) => [item, ...items]); setSelectedId(item.id); setWorkspaceTab("overview"); setDialogOpen(false); setNewIncident(""); await loadAudit();
      toast.success("Incident created", { description: `${item.id} was saved and queued for triage.` });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save incident"); }
    finally { setSavingIncident(false); }
  };

  useEffect(() => {
    incidentListRef.current = incidentList;
    analyzeRef.current = analyze;
  });

  useEffect(() => {
    const loadPersistentState = async () => {
      try {
        const response = await fetch("/api/incidents");
        const data = await response.json() as { incidents?: Array<{ id: string; title: string; description: string; customer: string; severity: Severity; status: IncidentStatus; createdAt: string | number }> };
        if (response.ok && data.incidents?.length) {
          const savedItems: Incident[] = data.incidents.map((saved) => ({ id: saved.id, title: saved.title, customer: saved.customer, severity: saved.severity, status: saved.status, age: "saved", source: "Manual report", summary: `Report saved. Run analysis to generate a recommendation.\n\n${saved.description}`, confidence: 0, evidence: [{ source: "Submitted report", detail: saved.description, relevance: 100 }], actions: [] }));
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
      await modelContext.registerTool?.({ name: "list_incidents", title: "List incidents", description: "Return the incident queue (sample and saved records).", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: async () => incidentListRef.current.map(({ id, title, severity, status }) => ({ id, title, severity, status })) }, { signal: lifecycle.signal });
      await modelContext.registerTool?.({ name: "start_incident_analysis", title: "Analyze incident", description: "Select an incident and start its analysis request. Model output is not operationally verified.", inputSchema: { type: "object", properties: { incidentId: { type: "string" } }, required: ["incidentId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: { incidentId?: string }) => { const match = incidentListRef.current.find((item) => item.id === input?.incidentId); if (!match) throw new Error("Unknown incident ID"); setSelectedId(match.id); await analyzeRef.current(match); return { incidentId: match.id, confidence: match.confidence, evidenceCount: match.evidence.length }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return <div className="app-shell">
    <Toaster position="top-right" richColors />
    <aside className={`side-rail ${mobileNav ? "mobile-open" : ""}`}>
      <div className="brand-mark"><span className="brand-symbol"><Activity /></span><span>ResolveOps <b>AI</b></span></div>
      <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
      <nav aria-label="Primary navigation" onClickCapture={() => setMobileNav(false)}>
        <button className="nav-item active" onClick={() => { setMobileNav(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}><LayoutDashboard />Command center</button><button className="nav-item" onClick={() => { setMobileNav(false); document.querySelector(".queue-panel")?.scrollIntoView({ behavior: "smooth" }); }}><Inbox />Incidents<span className="nav-count">{incidentList.length}</span></button><button className="nav-item" onClick={() => { setMobileNav(false); setWorkspaceTab("evidence"); document.querySelector(".incident-workspace")?.scrollIntoView({ behavior: "smooth" }); }}><BookOpen />Evidence</button><button className="nav-item" onClick={() => toast.info("Not implemented", { description: "This portfolio build has no automation or external action integration." })}><Bot />Automations</button><p className="nav-label">Intelligence</p><button className="nav-item" onClick={() => { setMobileNav(false); document.querySelector(".eval-summary")?.scrollIntoView({ behavior: "smooth" }); }}><Gauge />Evaluations</button><button className="nav-item" onClick={() => { setMobileNav(false); setWorkspaceTab("trace"); document.querySelector(".incident-workspace")?.scrollIntoView({ behavior: "smooth" }); }}><TerminalSquare />Request status</button>
      </nav>
      <div className="rail-footer"><div className="workspace-avatar">SY</div><div><strong>Sanaullah Yasir</strong><span>AI Engineer</span></div><Settings /></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><p className="eyebrow">PORTFOLIO DEMO · SAMPLE INCIDENT DATA</p><h1>Incident command center</h1></div><div className="top-actions"><div className="system-health">Simulation · not connected to operations</div><Button variant="ghost" size="icon" className="icon-button" disabled aria-label="Notifications are not implemented"><Bell /></Button><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button className="new-incident"><Plus />New incident</Button></DialogTrigger><DialogContent className="border-white/10 bg-[#101722] text-white sm:max-w-xl"><DialogHeader><DialogTitle>Create an incident</DialogTitle><DialogDescription className="text-slate-400">Save a sample incident report. This demo does not classify it or connect to an operations system.</DialogDescription></DialogHeader><label htmlFor="incident-report" className="text-sm text-slate-300">Incident report</label><Textarea id="incident-report" value={newIncident} onChange={(event) => setNewIncident(event.target.value)} placeholder="Describe the system failure..." className="min-h-32 border-white/10 bg-black/20 text-white placeholder:text-slate-600" /><DialogFooter><Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={savingIncident} onClick={createIncident} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{savingIncident ? <TimerReset className="animate-spin" /> : <Plus />}{savingIncident ? "Saving…" : "Create sample incident"}</Button></DialogFooter></DialogContent></Dialog></div></header>

      <section className="metrics-grid" aria-label="Portfolio sample metrics">
        <article className="metric-card"><div><span>Open incidents</span><strong>{incidentList.filter((item) => item.status !== "Resolved").length}</strong></div><div className="metric-icon coral"><AlertTriangle /></div><p><b>{incidentList.filter((item) => item.severity === "critical").length} critical</b> need attention</p></article>
        <article className="metric-card"><div><span>Sample auto-resolution</span><strong>71%</strong></div><div className="metric-icon mint"><Zap /></div><p>Illustrative value · not measured</p></article>
        <article className="metric-card"><div><span>Sample median response</span><strong>1m 42s</strong></div><div className="metric-icon blue"><Clock3 /></div><p>Illustrative value · not measured</p></article>
        <article className="metric-card eval-card"><div className="eval-head"><span>Sample evaluation</span><Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-200">Illustrative</Badge></div><div className="eval-score"><strong>—</strong><span>not measured</span></div><p className="muted">No benchmark connected</p></article>
      </section>

      <section className="workspace-grid">
        <div className="queue-panel panel"><div className="panel-heading"><div><p className="eyebrow">QUEUE · SAMPLE + SAVED</p><h2>Incidents</h2></div><Button variant="ghost" size="icon" className="icon-button" disabled title="Filtering is not implemented yet" aria-label="Filtering is not implemented yet"><ListFilter /></Button></div><label className="search-box"><Search /><input aria-label="Search incidents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search incidents" /></label><div className="incident-list">{filtered.map((incident) => <button key={incident.id} disabled={running} onClick={() => { setSelectedId(incident.id); setApproved(false); setRunStep(0); }} className={`incident-row ${incident.id === selectedId ? "selected" : ""}`}><span className={`severity-dot ${incident.severity}`} /><span className="incident-copy"><span className="incident-meta"><b>{incident.id}</b><small>{incident.age}</small></span><strong>{incident.title}</strong><small>{incident.customer}</small></span><ChevronRight /></button>)}{filtered.length === 0 && <div className="empty-queue"><Search /><p>No incidents match “{query}”. Clear the search to restore the queue.</p></div>}</div></div>

        <div className="incident-workspace panel"><div className="incident-header"><div><div className="incident-kicker"><Badge variant="outline" className={severityStyles[current.severity]}>{current.severity}</Badge><span>{current.id}</span><span>·</span><span>{current.source}</span></div><h2>{current.title}</h2><p>{current.customer} · Reported {current.age} ago</p></div><Button onClick={() => analyze()} disabled={running} className="analyze-button">{running ? <TimerReset className="animate-spin" /> : <Sparkles />}{running ? "Investigating…" : "Run analysis"}</Button></div>
          <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="workspace-tabs"><TabsList variant="line" className="tab-list"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="evidence">Evidence <span className="tab-count">{current.evidence.length}</span></TabsTrigger><TabsTrigger value="trace">Trace</TabsTrigger><TabsTrigger value="activity">Activity <span className="tab-count">{auditEvents.filter((event) => event.incidentId === current.id).length}</span></TabsTrigger></TabsList>
            <TabsContent value="overview" className="tab-content"><section className="diagnosis-card"><div className="diagnosis-top"><div><p className="eyebrow"><Bot />INCIDENT SUMMARY <span className={`model-mode ${analysisModes[current.id] === "live" ? "live" : "demo"}`}>{analysisModes[current.id] === "live" ? "Model output · unverified" : incidents.some((sample) => sample.id === current.id) ? "Illustrative sample" : analysisModes[current.id] === "unavailable" ? "Provider unavailable" : "Not analyzed"}</span></p><h3>{current.actions.length ? "Suggested diagnosis" : "No analysis result"}</h3></div><ScoreRing value={current.confidence} /></div><p>{current.summary}</p><div className="source-links">{current.evidence.map((item, index) => <button key={item.source} onClick={() => toast.info(item.source, { description: item.detail })}><FileSearch />[{index + 1}] {item.source}</button>)}</div></section>
              <section className="plan-card"><div className="section-title"><div><p className="eyebrow">RECOMMENDATIONS</p><h3>Suggested actions</h3></div><span className="approval-label"><LockKeyhole />Manual review</span></div>{current.actions.length ? <ol className="action-list">{current.actions.map((action, index) => <li key={`${index}-${action}`}><span>{index + 1}</span><div><strong>{action}</strong><small>Recommendation only · no integration or execution</small></div></li>)}</ol> : <p className="muted">No recommendation is available. Run analysis first.</p>}<div className="approval-bar"><div className="risk-note"><ShieldCheck /><span><strong>Review before acting</strong><small>This demo does not validate operational safety</small></span></div><div><Button variant="ghost" onClick={reject} disabled={!current.actions.length}><ThumbsDown />Reject</Button><Button onClick={approve} disabled={approved || !current.actions.length} className="approve-button">{approved ? <CheckCircle2 /> : <ThumbsUp />}{approved ? "Approval recorded" : current.actions.length ? "Record approval only" : "No actions"}</Button></div></div></section>
            </TabsContent>
            <TabsContent value="evidence" className="tab-content evidence-tab"><div className="section-title"><div><p className="eyebrow">SUPPLIED SAMPLE EVIDENCE</p><h3>Evidence items</h3></div><Badge variant="outline" className="border-amber-300/20 text-amber-200">Not independently verified</Badge></div>{current.evidence.map((item, index) => <article className="evidence-card" key={item.source}><span className="evidence-index">0{index + 1}</span><div><strong>{item.source}</strong><p>{item.detail}</p></div><div className="relevance"><b>{item.relevance}%</b><span>sample relevance</span></div></article>)}</TabsContent>
            <TabsContent value="trace" className="tab-content trace-tab"><div className="section-title"><div><p className="eyebrow">REQUEST STATUS</p><h3>Analysis request</h3></div></div><div className="activity-empty"><TerminalSquare /><strong>{running ? "Request in progress" : runStep === traceSteps.length ? "Request completed" : "No server trace available"}</strong><p>This build does not collect model tokens, provider cost, tool calls, or server-stage timings. No execution trace is fabricated.</p></div></TabsContent>
            <TabsContent value="activity" className="tab-content activity-tab"><div className="section-title"><div><p className="eyebrow">AUDIT HISTORY</p><h3>Recorded actions for {current.id}</h3></div><Badge variant="outline" className={auditUnavailable ? "border-rose-400/20 text-rose-300" : "border-cyan-300/20 text-cyan-200"}>{auditUnavailable ? "Storage unavailable" : "Database-backed, not tamper-proof"}</Badge></div><div className="activity-list">{auditEvents.filter((event) => event.incidentId === current.id).map((event) => <article key={event.id}><span className="activity-icon"><Activity /></span><div><strong>{event.eventType.replaceAll(".", " ")}</strong><p>{event.detail}</p></div><time>{new Date(event.createdAt).toLocaleString()}</time></article>)}{auditEvents.filter((event) => event.incidentId === current.id).length === 0 && <div className="activity-empty"><Activity /><strong>{auditUnavailable ? "Audit history could not be loaded" : "No recorded actions yet"}</strong><p>{auditUnavailable ? "Check the connection and reload before relying on this history." : "Analysis or reviewer decisions will appear here when storage is available."}</p></div>}</div></TabsContent>
          </Tabs>
        </div>

        <aside className="insights-panel"><section className="panel health-card"><div className="panel-heading"><div><p className="eyebrow">SAMPLE DATA</p><h2>Example service health</h2></div><Activity /></div><div className="service-list"><div><span>Checkout API</span><b>99.2%</b></div><div><span>Payment gateway</span><b>68.1%</b></div><div><span>Auth service</span><b>99.9%</b></div><div><span>Job workers</span><b>98.7%</b></div></div><button className="text-link" disabled title="Service map is not implemented">Service map not available <ArrowUpRight /></button></section><section className="panel eval-summary"><div className="panel-heading"><div><p className="eyebrow">SAMPLE QUALITY DATA</p><h2>Illustrative only</h2></div><Gauge /></div><div className="activity-empty"><strong>No evaluation results</strong><p>No benchmark dataset or evaluation runs are connected to this dashboard.</p></div></section><section className="security-note"><ShieldCheck /><div><strong>Basic input boundary</strong><p>Incident text is marked untrusted in the model prompt. This is not a complete injection scan or operational safety system.</p></div></section></aside>
      </section>
    </main>
  </div>;
}
