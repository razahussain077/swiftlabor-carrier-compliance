"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Clock3, ExternalLink, FileCheck2, FileText, Loader2, LockKeyhole, ShieldAlert, ShieldCheck, UploadCloud, XCircle } from "lucide-react";

const docs = [
  { name: "W-9.pdf", type: "Tax identity", status: "READY", meta: "Template · sanitized demo values" },
  { name: "Certificate_of_Liability_Insurance.pdf", type: "Insurance certificate", status: "READY", meta: "ACORD 25 sample · sanitized" },
  { name: "Carrier_Agreement.pdf", type: "Broker agreement", status: "MISSING", meta: "Required before activation" },
];

const checks = [
  ["Carrier identity", "MATCHED", "pass", "Legal name and carrier identifiers are consistent."],
  ["Operating authority", "VERIFIED", "pass", "Public FMCSA SAFER lookup is available."],
  ["Auto liability", "$1M", "pass", "Meets the broker requirement of $1,000,000."],
  ["Cargo coverage", "$50K", "block", "Below the $100,000 broker requirement."],
  ["COI expiration", "18 DAYS", "warn", "Renewal follow-up should start now."],
  ["Carrier agreement", "MISSING", "block", "Signed agreement is required before activation."],
] as const;

export default function Home() {
  const [running, setRunning] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function review() {
    if (running) return;
    setRunning(true);
    await new Promise((r) => setTimeout(r, 1700));
    setReviewed(true);
    setRunning(false);
  }

  function copyDecision() {
    navigator.clipboard?.writeText("REVIEW — Do not activate. Cargo coverage is below the broker threshold, the COI expires in 18 days, and the carrier agreement is missing.");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

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
        <div className="heroRow"><div><div className="eyebrow">AI OPERATIONS AGENT · 02</div><h1>CarrierGate</h1><p>Turn a new carrier packet into a clear, evidence-backed activation decision.</p></div><div className="agentChip"><div className="agentIcon"><ShieldCheck size={17}/></div><div><strong>Compliance & onboarding</strong><small>Exception engine · document checks</small></div></div></div>

        <section className="intake">
          <div className="intakeHead"><div><span className="step">01</span><div><h2>Carrier packet</h2><p>Review the documents a new carrier submitted for onboarding.</p></div></div><span className="secure"><LockKeyhole size={12}/> Private review workflow</span></div>
          <div className="carrierBar"><div className="carrierAvatar">AT</div><div><span>CARRIER UNDER REVIEW</span><strong>Atlas Transport LLC</strong><small>MC 123456 · USDOT 987654 · Demo record</small></div><span className="sample">SANITIZED SAMPLE</span></div>
          <div className="docs">{docs.map((d) => <div className={`doc ${d.status.toLowerCase()}`} key={d.name}><div className="docIcon">{d.status === "MISSING" ? <UploadCloud size={18}/> : <FileCheck2 size={18}/>}</div><div className="docCopy"><strong>{d.name}</strong><span>{d.type}</span><small>{d.meta}</small></div><em>{d.status}</em></div>)}</div>
          <div className="intakeFoot"><button className="primary" onClick={review} disabled={running}>{running ? <><Loader2 size={15} className="spin"/> Running checks…</> : <><ShieldCheck size={15}/> Run compliance review <ArrowRight size={15}/></>}</button><span><Check size={12}/> Cross-document · requirements · public-source verification</span></div>
        </section>

        <div className="sectionTitle"><div><div className="eyebrow">02 · DECISION ENGINE</div><h2>Documents → decision</h2></div>{reviewed && <span className="complete"><CheckCircle2 size={14}/> Review complete</span>}</div>

        {!reviewed ? <section className="waiting"><div className="waitingIcon"><ShieldCheck size={23}/></div><strong>Ready to review</strong><p>CarrierGate will extract the packet, compare documents against broker requirements, check public carrier evidence, and surface exceptions.</p><div className="pipeline"><span>EXTRACT</span><ChevronRight size={13}/><span>COMPARE</span><ChevronRight size={13}/><span>VERIFY</span><ChevronRight size={13}/><span>DECIDE</span></div></section> : <section className="results">
          <div className="decision"><div><div className="decisionTag"><span>REVIEW</span><small>RECOMMENDED ACTIVATION STATUS</small></div><h3>Do not activate yet</h3><p>Two blocking exceptions and one renewal risk were detected. Resolve the packet before the carrier becomes dispatch-ready.</p></div><div className="readiness"><span>READINESS</span><strong>62</strong><small>/ 100</small></div></div>
          <div className="checks">{checks.map(([label,value,tone,detail]) => <div className="check" key={label}><div className={`checkMark ${tone}`}>{tone === "pass" ? <Check size={15}/> : tone === "warn" ? <AlertTriangle size={15}/> : <XCircle size={15}/>}</div><div><span>{label}</span><strong>{value}</strong><p>{detail}</p></div></div>)}</div>
          <div className="columns"><div className="panel"><div className="panelHead"><div><div className="eyebrow">EXCEPTIONS</div><h3>Action required</h3></div><span className="count">3 ACTIONS</span></div><Exception title="Cargo coverage is below threshold" text="Observed: $50K · Required: $100K. Request an updated certificate or endorsement before activation."/><Exception title="Carrier agreement is missing" text="The packet is incomplete. Request the signed broker-carrier agreement from the carrier contact."/><Exception title="COI expires in 18 days" text="Start renewal follow-up now so coverage does not lapse after approval."/></div>
          <div className="panel"><div className="panelHead"><div><div className="eyebrow">EVIDENCE TRAIL</div><h3>Public sources</h3></div><span className="trace"><Check size={12}/> TRACEABLE</span></div><Source title="FMCSA SAFER Company Snapshot" detail="Carrier identity & public safety record" href="https://safer.fmcsa.dot.gov/CompanySnapshot.aspx"/><Source title="IRS Form W-9" detail="Current public tax-form template" href="https://www.irs.gov/pub/irs-pdf/fw9.pdf"/><Source title="ACORD 25 sample" detail="Public government procurement reference" href="https://www.govinfo.gov/content/pkg/GOVPUB-A13-PURL-gpo124166/pdf/GOVPUB-A13-PURL-gpo124166.pdf"/><div className="evidenceNote"><ShieldCheck size={14}/><span>Public sources are evidence references. Final carrier approval remains a human decision.</span></div></div></div>
          <div className="next"><div><div className="eyebrow">RECOMMENDED NEXT STEP</div><h3>Request updated cargo coverage + signed carrier agreement</h3><p>Once exceptions are resolved, rerun the review before activation.</p></div><div className="buttons"><button onClick={copyDecision}><FileText size={14}/> {copied ? "Copied" : "Copy decision"}</button><button onClick={() => setReviewed(false)} className="secondary">Review again</button></div></div>
        </section>}
        <footer><strong>SwiftLabor</strong><span>CarrierGate · Demo environment · Evidence-first operations</span></footer>
      </main>
    </div>
  </div>
}

function Exception({title,text}:{title:string;text:string}) { return <div className="exception"><span>BLOCK</span><div><strong>{title}</strong><p>{text}</p></div></div> }
function Source({title,detail,href}:{title:string;detail:string;href:string}) { return <a className="source" href={href} target="_blank" rel="noreferrer"><div><strong>{title}</strong><small>{detail}</small></div><ExternalLink size={13}/></a> }
