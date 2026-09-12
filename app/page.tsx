"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Clock3, ExternalLink, FileCheck2, FileText, Loader2, LockKeyhole, ShieldCheck, UploadCloud, XCircle } from "lucide-react";

const docs = [
  { name: "W-9.pdf", type: "Tax identity", status: "READY", meta: "Template · sanitized demo values" },
  { name: "Certificate_of_Liability_Insurance.pdf", type: "Insurance certificate", status: "READY", meta: "ACORD 25 sample · sanitized" },
  { name: "Carrier_Agreement.pdf", type: "Broker agreement", status: "MISSING", meta: "Required before activation" },
];

type Review = { status:string; readiness:number; summary:string; checks:{label:string;value:string;tone:"pass"|"warn"|"block";detail:string}[]; nextStep:string; ai:boolean; source:string };

const demoPacket = {
  legalName: "Atlas Transport LLC",
  mc: "123456",
  dot: "987654",
  w9Present: true,
  coiPresent: true,
  autoLiability: 1_000_000,
  cargoCoverage: 50_000,
  coiDaysRemaining: 18,
  carrierAgreementPresent: false,
  authorityStatus: "unknown",
};

export default function Home() {
  const [running, setRunning] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [review, setReview] = useState<Review | null>(null);

  async function runReview() {
    if (running) return;
    setRunning(true);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packet: demoPacket }),
      });
      if (!response.ok) throw new Error("Review failed");
      const data = await response.json() as Review;
      setReview(data);
      setReviewed(true);
    } catch {
      setReview({
        status: "REVIEW",
        readiness: 38,
        summary: "CarrierGate could not complete the review request. No approval decision was made.",
        checks: [],
        nextStep: "Retry the compliance review",
        ai: false,
        source: "request fallback",
      });
      setReviewed(true);
    } finally { setRunning(false); }
  }

  function copyDecision() {
    const r = review;
    navigator.clipboard?.writeText(`${r?.status ?? "REVIEW"} — ${r?.summary ?? "Resolve compliance exceptions before activation."}`);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  const decisionTitle = review?.status === "PASS" ? "Ready for approval" : "Do not activate yet";

  return <div className="app">
    <header className="header"><div className="headerInner">
      <div className="brand"><div className="mark">S</div><strong>SwiftLabor</strong><span className="slash">/</span><span className="product">CARRIERGATE</span></div>
      <div className="headerRight"><span className="status"><i/> DEMO ENVIRONMENT</span><button className="help"><CircleHelp size={15}/></button></div>
    </div></header>
    <div className="shell">
      <aside className="rail">
        <div className="railTitle">OPERATIONS</div>
        <div className="railItem active"><ClipboardCheck size={16}/><span>Carrier review</span></div>
        <div className="railItem"><FileText size={16}/><span>Document packet</span><b>03</b></div>
        <div className="railItem"><Clock3 size={16}/><span>Renewals</span><b>01</b></div>
        <div className="railFoot"><LockKeyhole size={15}/><div><strong>Human approval</strong><small>CarrierGate recommends. Your team approves.</small></div></div>
      </aside>
      <main className="main">
        <div className="heroRow"><div><div className="eyebrow">AI OPERATIONS AGENT · 02</div><h1>CarrierGate</h1><p>Turn a new carrier packet into a clear, evidence-backed activation decision.</p></div><div className="agentChip"><div className="agentIcon"><ShieldCheck size={17}/></div><div><strong>Compliance & onboarding</strong><small>AI decision engine · deterministic guardrails</small></div></div></div>
        <section className="intake">
          <div className="intakeHead"><div><span className="step">01</span><div><h2>Carrier packet</h2><p>Review the documents a new carrier submitted for onboarding.</p></div></div><span className="secure"><LockKeyhole size={12}/> Private review workflow</span></div>
          <div className="carrierBar"><div className="carrierAvatar">AT</div><div><span>CARRIER UNDER REVIEW</span><strong>Atlas Transport LLC</strong><small>MC 123456 · USDOT 987654 · Demo record</small></div><span className="sample">SANITIZED SAMPLE</span></div>
          <div className="docs">{docs.map((d) => <div className={`doc ${d.status.toLowerCase()}`} key={d.name}><div className="docIcon">{d.status === "MISSING" ? <UploadCloud size={18}/> : <FileCheck2 size={18}/>}</div><div className="docCopy"><strong>{d.name}</strong><span>{d.type}</span><small>{d.meta}</small></div><em>{d.status}</em></div>)}</div>
          <div className="intakeFoot"><button className="primary" onClick={runReview} disabled={running}>{running ? <><Loader2 size={15} className="spin"/> AI reviewing…</> : <><ShieldCheck size={15}/> Run AI compliance review <ArrowRight size={15}/></>}</button><span><Check size={12}/> Extract · compare · verify · recommend</span></div>
        </section>
        <div className="sectionTitle"><div><div className="eyebrow">02 · DECISION ENGINE</div><h2>Documents → decision</h2></div>{reviewed && <span className="complete"><CheckCircle2 size={14}/> Review complete · {review?.ai ? "AI analyzed" : "Rules protected"}</span>}</div>
        {!reviewed ? <section className="waiting"><div className="waitingIcon"><ShieldCheck size={23}/></div><strong>Ready to review</strong><p>CarrierGate will analyze the supplied packet against broker requirements, preserve deterministic compliance guardrails, and surface exceptions.</p><div className="pipeline"><span>EXTRACT</span><ChevronRight size={13}/><span>COMPARE</span><ChevronRight size={13}/><span>VERIFY</span><ChevronRight size={13}/><span>DECIDE</span></div></section> : <section className="results">
          <div className="decision"><div><div className="decisionTag"><span>{review?.status}</span><small>RECOMMENDED ACTIVATION STATUS</small></div><h3>{decisionTitle}</h3><p>{review?.summary}</p></div><div className="readiness"><span>READINESS</span><strong>{review?.readiness}</strong><small>/ 100</small></div></div>
          <div className="checks">{review?.checks.map((c) => <div className="check" key={c.label}><div className={`checkMark ${c.tone}`}>{c.tone === "pass" ? <Check size={15}/> : c.tone === "warn" ? <AlertTriangle size={15}/> : <XCircle size={15}/>}</div><div><span>{c.label}</span><strong>{c.value}</strong><p>{c.detail}</p></div></div>)}</div>
          <div className="columns"><div className="panel"><div className="panelHead"><div><div className="eyebrow">EXCEPTIONS</div><h3>Action required</h3></div><span className="count">{review?.checks.filter((c) => c.tone !== "pass").length} ACTIONS</span></div>{review?.checks.filter((c) => c.tone !== "pass").map((c) => <Exception key={c.label} title={c.label} text={c.detail}/>)}</div>
          <div className="panel"><div className="panelHead"><div><div className="eyebrow">EVIDENCE TRAIL</div><h3>Public sources</h3></div><span className="trace"><Check size={12}/> TRACEABLE</span></div><Source title="FMCSA SAFER Company Snapshot" detail="Public carrier authority & safety source" href="https://safer.fmcsa.dot.gov/CompanySnapshot.aspx"/><Source title="IRS Form W-9" detail="Current public tax-form template" href="https://www.irs.gov/pub/irs-pdf/fw9.pdf"/><Source title="ACORD 25 sample" detail="Public government procurement reference" href="https://www.govinfo.gov/content/pkg/GOVPUB-A13-PURL-gpo124166/pdf/GOVPUB-A13-PURL-gpo124166.pdf"/><div className="evidenceNote"><ShieldCheck size={14}/><span>CarrierGate never invents live verification. Unknown public-source checks remain human review items.</span></div></div></div>
          <div className="next"><div><div className="eyebrow">RECOMMENDED NEXT STEP</div><h3>{review?.nextStep}</h3><p>Once exceptions are resolved, rerun the review before activation.</p></div><div className="buttons"><button onClick={copyDecision}><FileText size={14}/> {copied ? "Copied" : "Copy decision"}</button><button onClick={() => {setReviewed(false);setReview(null)}} className="secondary">Review again</button></div></div>
        </section>}
        <footer><strong>SwiftLabor</strong><span>CarrierGate · Demo environment · AI-assisted evidence-first operations</span></footer>
      </main>
    </div>
  </div>
}
function Exception({title,text}:{title:string;text:string}) { return <div className="exception"><span>REVIEW</span><div><strong>{title}</strong><p>{text}</p></div></div> }
function Source({title,detail,href}:{title:string;detail:string;href:string}) { return <a className="source" href={href} target="_blank" rel="noreferrer"><div><strong>{title}</strong><small>{detail}</small></div><ExternalLink size={13}/></a> }
