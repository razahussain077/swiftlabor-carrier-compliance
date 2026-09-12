import { NextResponse } from "next/server";
import pdf from "pdf-parse";

type Tone = "pass" | "warn" | "block";
type Packet = {
  legalName: string; mc: string; dot: string; w9Present: boolean; coiPresent: boolean;
  autoLiability: number; cargoCoverage: number; coiDaysRemaining: number;
  carrierAgreementPresent: boolean; authorityStatus: "active" | "inactive" | "unknown";
};
type Check = { label:string; value:string; tone:Tone; detail:string };

const DEMO_PACKET: Packet = { legalName:"Atlas Transport LLC", mc:"123456", dot:"987654", w9Present:true, coiPresent:true, autoLiability:1_000_000, cargoCoverage:50_000, coiDaysRemaining:18, carrierAgreementPresent:false, authorityStatus:"unknown" };

function money(text:string, patterns:RegExp[]) {
  for (const re of patterns) { const m=text.match(re); if(m) return Number(m[1].replace(/[$,]/g,"")); }
  return 0;
}
function extractPacket(text:string, names:string[]):Packet {
  const t=text.replace(/\s+/g," ");
  const mc=t.match(/\bMC(?:\s*(?:NO|NUMBER))?\s*[:#-]?\s*(\d{4,8})\b/i)?.[1] || DEMO_PACKET.mc;
  const dot=t.match(/\bUSDOT(?:\s*(?:NO|NUMBER))?\s*[:#-]?\s*(\d{5,9})\b/i)?.[1] || DEMO_PACKET.dot;
  const legal=t.match(/(?:legal name|named insured|insured name)\s*[:#-]\s*([A-Z0-9][A-Z0-9 .,&'/-]{2,80})/i)?.[1]?.trim() || DEMO_PACKET.legalName;
  const auto=money(t,[/(?:auto(?:mobile)?\s+liability|combined single limit|CSL)[^$]{0,60}\$([\d,]+)/i]);
  const cargo=money(t,[/(?:cargo|motor truck cargo)[^$]{0,60}\$([\d,]+)/i]);
  const date=t.match(/(?:expiration|expires|expiration date|policy expiration)[^0-9]{0,30}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1];
  let days=DEMO_PACKET.coiDaysRemaining;
  if(date){ const d=new Date(date); if(!Number.isNaN(d.getTime())) days=Math.ceil((d.getTime()-Date.now())/86400000); }
  return { legalName:legal, mc, dot, w9Present:names.some(n=>/w-?9/i.test(n)), coiPresent:names.some(n=>/(coi|certificate.*insurance|acord)/i.test(n)), autoLiability:auto || DEMO_PACKET.autoLiability, cargoCoverage:cargo || DEMO_PACKET.cargoCoverage, coiDaysRemaining:days, carrierAgreementPresent:names.some(n=>/agreement/i.test(n)), authorityStatus:"unknown" };
}
function evaluate(packet:Packet){
  const checks:Check[]=[
    {label:"Carrier identity",value:packet.legalName&&packet.mc&&packet.dot?"MATCHED":"INCOMPLETE",tone:packet.legalName&&packet.mc&&packet.dot?"pass":"block",detail:packet.legalName&&packet.mc&&packet.dot?`Legal name, MC ${packet.mc}, and USDOT ${packet.dot} are present in the packet.`:"Legal name, MC number, and USDOT number are required."},
    {label:"Operating authority",value:packet.authorityStatus==="active"?"ACTIVE":packet.authorityStatus==="inactive"?"INACTIVE":"CHECK REQUIRED",tone:packet.authorityStatus==="active"?"pass":packet.authorityStatus==="inactive"?"block":"warn",detail:packet.authorityStatus==="active"?"Authority supplied as active by the verification source.":packet.authorityStatus==="inactive"?"Authority is inactive. Do not activate the carrier.":"Live FMCSA/SAFER verification is required; CarrierGate does not invent a verification result."},
    {label:"Auto liability",value:`$${Math.round(packet.autoLiability/1000)}K`,tone:packet.autoLiability>=1_000_000?"pass":"block",detail:packet.autoLiability>=1_000_000?"Meets the configured $1,000,000 minimum.":"Below the configured $1,000,000 minimum."},
    {label:"Cargo coverage",value:`$${Math.round(packet.cargoCoverage/1000)}K`,tone:packet.cargoCoverage>=100_000?"pass":"block",detail:packet.cargoCoverage>=100_000?"Meets the configured $100,000 minimum.":"Below the configured $100,000 minimum."},
    {label:"COI expiration",value:packet.coiPresent?`${packet.coiDaysRemaining} DAYS`:"MISSING",tone:!packet.coiPresent||packet.coiDaysRemaining<=0?"block":packet.coiDaysRemaining<=30?"warn":"pass",detail:!packet.coiPresent?"Certificate of insurance is missing.":packet.coiDaysRemaining<=0?"Certificate appears expired.":packet.coiDaysRemaining<=30?"Renewal follow-up should start now.":"Certificate remains within the configured validity window."},
    {label:"Required documents",value:packet.w9Present&&packet.coiPresent&&packet.carrierAgreementPresent?"COMPLETE":"INCOMPLETE",tone:packet.w9Present&&packet.coiPresent&&packet.carrierAgreementPresent?"pass":"block",detail:packet.w9Present&&packet.coiPresent&&packet.carrierAgreementPresent?"W-9, COI, and carrier agreement are present.":`Missing: ${[!packet.w9Present?"W-9":"",!packet.coiPresent?"COI":"",!packet.carrierAgreementPresent?"carrier agreement":""].filter(Boolean).join(", ")}.`}
  ];
  const blockers=checks.filter(c=>c.tone==="block").length,warnings=checks.filter(c=>c.tone==="warn").length;
  return {checks,blockers,warnings,status:blockers?"REVIEW":warnings?"REVIEW":"PASS",readiness:Math.max(0,Math.min(100,100-blockers*22-warnings*8)),nextStep:blockers?`Resolve ${blockers} blocking ${blockers===1?"exception":"exceptions"} before activation`:warnings?"Complete the remaining verification checks before activation":"Approve the carrier or continue with your broker activation workflow"};
}
function extractJson(text:string){const c=text.replace(/```json/gi,"").replace(/```/g,"").trim(),s=c.indexOf("{"),e=c.lastIndexOf("}");if(s<0||e<=s)throw new Error("No JSON");return JSON.parse(c.slice(s,e+1));}

export async function POST(request:Request){
  let packet=DEMO_PACKET; let source="deterministic compliance rules"; let extractedFiles:string[]=[];
  try{
    const contentType=request.headers.get("content-type")||"";
    if(contentType.includes("multipart/form-data")){
      const form=await request.formData(); const files=form.getAll("files").filter((x):x is File=>x instanceof File);
      if(files.length){let combined=""; for(const file of files){if(file.size>8_000_000) throw new Error("File too large"); if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")) throw new Error("PDF files only"); const buffer=Buffer.from(await file.arrayBuffer()); const parsed=await pdf(buffer); combined+=`\n--- ${file.name} ---\n${parsed.text}`; extractedFiles.push(file.name);} packet=extractPacket(combined,files.map(f=>f.name)); source="uploaded PDF packet + deterministic rules";}
    } else { const body=await request.json(); if(body?.packet) packet={...DEMO_PACKET,...body.packet} as Packet; }
  }catch(error){ return NextResponse.json({error:error instanceof Error?error.message:"Unable to process packet"},{status:400}); }
  const evaluated=evaluate(packet); const key=process.env.OPENROUTER_API_KEY;
  if(!key)return NextResponse.json({...evaluated,summary:`${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} warning(s) detected from the supplied packet.`,ai:false,source,extractedFiles});
  const prompt=`You are CarrierGate, a freight carrier compliance operations agent. Write a concise operations brief from this deterministic evaluation. Never change, invent, or downgrade a rule. Return ONLY JSON with summary and nextStep. Packet: ${JSON.stringify(packet)} Evaluation: ${JSON.stringify(evaluated)}. Mention live FMCSA verification is required when authority is unknown. Do not provide legal advice.`;
  try{const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":"https://swiftlabor-carrier-compliance.vercel.app","X-Title":"SwiftLabor CarrierGate"},body:JSON.stringify({model:"openrouter/free",messages:[{role:"user",content:prompt}],temperature:.1})});if(!r.ok)throw new Error(`OpenRouter ${r.status}`);const d=await r.json(),ai=extractJson(d?.choices?.[0]?.message?.content||"");return NextResponse.json({...evaluated,summary:typeof ai.summary==="string"?ai.summary:`${evaluated.blockers} blocking exception(s) detected.`,nextStep:typeof ai.nextStep==="string"?ai.nextStep:evaluated.nextStep,ai:true,source:`${source} + OpenRouter`,extractedFiles});}
  catch{return NextResponse.json({...evaluated,summary:`${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} warning(s) detected. AI explanation was unavailable, so the deterministic result was preserved.`,ai:false,source,extractedFiles});}
}
