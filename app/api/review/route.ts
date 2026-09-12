import { NextResponse } from "next/server";
import pdf from "pdf-parse";

type Tone = "pass" | "warn" | "block";
type Packet = { legalName:string; mc:string; dot:string; w9Present:boolean; coiPresent:boolean; autoLiability:number; cargoCoverage:number; coiDaysRemaining:number|null; carrierAgreementPresent:boolean; authorityStatus:"active"|"inactive"|"unknown" };
type Check = { label:string; value:string; tone:Tone; detail:string };

function clean(value:string){return value.replace(/\s+/g," ").replace(/[|]+/g," ").trim();}
function money(text:string, patterns:RegExp[]) {
  for(const re of patterns){
    const m=text.match(re);
    if(m){const n=Number(m[1].replace(/[$,\s]/g,"")); if(Number.isFinite(n)) return n;}
  }
  return 0;
}
function firstMatch(text:string, patterns:RegExp[]){
  for(const re of patterns){const m=text.match(re); if(m?.[1]) return clean(m[1]);}
  return "";
}
function parseUsDate(value:string){
  const v=value.trim();
  const m=v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(!m)return null;
  let year=Number(m[3]); if(year<100)year+=year>=70?1900:2000;
  const d=new Date(year,Number(m[1])-1,Number(m[2]));
  return d.getFullYear()===year&&d.getMonth()===Number(m[1])-1&&d.getDate()===Number(m[2])?d:null;
}
function daysUntilDate(value:string){
  const d=parseUsDate(value); if(!d)return null;
  return Math.ceil((d.getTime()-Date.now())/86400000);
}
function extractPacket(documents:{name:string;text:string}[]):Packet{
  const t=clean(documents.map(d=>d.text).join("\n"));
  const w9Docs=documents.filter(d=>/\bw-?9\b/i.test(d.name)||/request for taxpayer identification number|form w-9|w-9/i.test(d.text));
  // Only strong certificate-of-insurance signals classify a document as a COI. Avoid treating a carrier agreement that mentions an "insured" as the insurance source.
  const coiDocs=documents.filter(d=>/\bcoi\b|certificate.*insurance|acord/i.test(d.name)||/certificate of liability insurance|acord 25|certificate of insurance/i.test(d.text));
  const agreementDocs=documents.filter(d=>/agreement|contract|broker.*carrier|carrier.*broker/i.test(d.name)||/carrier broker agreement|broker carrier agreement|motor carrier agreement|carrier agreement|transportation services agreement/i.test(d.text));
  const w9Present=w9Docs.length>0;
  const coiPresent=coiDocs.length>0;
  const carrierAgreementPresent=agreementDocs.length>0;

  const mc=firstMatch(t,[/\bMC\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*(\d{4,8})\b/i,/\bMC[-\s]?(\d{4,8})\b/i]);
  const dot=firstMatch(t,[/\b(?:USDOT|US DOT)\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*(\d{5,9})\b/i,/\bDOT[-\s]?(\d{5,9})\b/i]);
  const legal=firstMatch(t,[
    /legal\s+name\s*[:#-]\s*([A-Z0-9][A-Z0-9 .,&'\/-]{2,100})/i,
    /(?:named insured|insured name|named entity)\s*[:#-]\s*([A-Z0-9][A-Z0-9 .,&'\/-]{2,100})/i,
    /name\s*\(as shown on your income tax return\)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 .,&'\/-]{2,100})/i,
    /legal business name\s*[:#-]\s*([A-Z0-9][A-Z0-9 .,&'\/-]{2,100})/i
  ]);

  // Coverage values must come from insurance-document evidence, not from broker/carrier agreement requirements.
  const coiText=coiDocs.map(d=>d.text).join("\n");
  const auto=money(coiText,[
    /(?:auto(?:mobile)?\s+liability|commercial\s+auto|combined single limit|\bCSL\b)[^$\d]{0,100}\$\s*([\d,]+)/i,
    /(?:each accident|any one accident)[^$\d]{0,70}\$\s*([\d,]+)/i
  ]);
  const cargo=money(coiText,[
    /(?:motor truck cargo|cargo(?:\s+liability)?)[^$\d]{0,100}\$\s*([\d,]+)/i,
    /cargo[^$\d]{0,40}(?:limit|coverage)[^$\d]{0,40}\$\s*([\d,]+)/i
  ]);

  const expiration=firstMatch(coiText,[
    /(?:expiration|expires|expiration date|policy expiration|policy period)[^0-9]{0,45}(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /(?:to|through)\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i
  ]);
  const coiDaysRemaining=expiration?daysUntilDate(expiration):null;

  const authorityStatus:"active"|"inactive"|"unknown"="unknown";
  return {legalName:legal,mc,dot,w9Present,coiPresent,autoLiability:auto,cargoCoverage:cargo,coiDaysRemaining,carrierAgreementPresent,authorityStatus};
}
function evaluate(p:Packet){
 const identity=Boolean(p.legalName&&p.mc&&p.dot);
 const checks:Check[]=[
  {label:"Carrier identity",value:identity?"MATCHED":"INCOMPLETE",tone:identity?"pass":"block",detail:identity?`Legal name, MC ${p.mc}, and USDOT ${p.dot} were extracted from the uploaded packet.`:"Legal name, MC number, and USDOT number could not all be extracted from the uploaded packet."},
  {label:"Operating authority",value:p.authorityStatus==="active"?"ACTIVE":p.authorityStatus==="inactive"?"INACTIVE":"CHECK REQUIRED",tone:p.authorityStatus==="active"?"pass":p.authorityStatus==="inactive"?"block":"warn",detail:p.authorityStatus==="unknown"?"Live FMCSA/SAFER verification is required; CarrierGate does not infer or invent a verification result.":p.authorityStatus==="active"?"Authority verified as active.":"Authority is inactive. Do not activate the carrier."},
  {label:"Auto liability",value:p.autoLiability?`$${Math.round(p.autoLiability/1000)}K`:"NOT FOUND",tone:p.autoLiability>=1000000?"pass":"block",detail:p.autoLiability>=1000000?"Detected on the uploaded certificate and meets the configured $1,000,000 minimum.":"Insurance coverage was not found on the uploaded COI or is below the configured $1,000,000 minimum."},
  {label:"Cargo coverage",value:p.cargoCoverage?`$${Math.round(p.cargoCoverage/1000)}K`:"NOT FOUND",tone:p.cargoCoverage>=100000?"pass":"block",detail:p.cargoCoverage>=100000?"Detected on the uploaded certificate and meets the configured $100,000 minimum.":"Cargo coverage was not found on the uploaded COI. Minimum required: $100,000."},
  {label:"COI expiration",value:!p.coiPresent?"MISSING":p.coiDaysRemaining===null?"NOT FOUND":`${p.coiDaysRemaining} DAYS`,tone:!p.coiPresent||p.coiDaysRemaining===null||p.coiDaysRemaining<=0?"block":p.coiDaysRemaining<=30?"warn":"pass",detail:!p.coiPresent?"Certificate of insurance is missing.":p.coiDaysRemaining===null?"A COI was uploaded, but an actual expiration date could not be extracted.":p.coiDaysRemaining<=0?"Certificate appears expired.":p.coiDaysRemaining<=30?"Renewal follow-up should start now.":"Certificate remains within the configured validity window."},
  {label:"Required documents",value:p.w9Present&&p.coiPresent&&p.carrierAgreementPresent?"COMPLETE":"INCOMPLETE",tone:p.w9Present&&p.coiPresent&&p.carrierAgreementPresent?"pass":"block",detail:p.w9Present&&p.coiPresent&&p.carrierAgreementPresent?"W-9, COI, and carrier agreement are present.":`Missing: ${[!p.w9Present?"W-9":"",!p.coiPresent?"COI":"",!p.carrierAgreementPresent?"carrier agreement":""].filter(Boolean).join(", ")}.`}
 ];
 const blockers=checks.filter(c=>c.tone==="block").length,warnings=checks.filter(c=>c.tone==="warn").length;
 const actionCount=blockers+warnings;
 const nextStep=blockers
   ? `Resolve ${blockers} blocking ${blockers===1?"exception":"exceptions"}${warnings?` and complete ${warnings} verification ${warnings===1?"check":"checks"}`:""} before activation`
   : warnings
     ? `Complete ${warnings} verification ${warnings===1?"check":"checks"} before activation`
     : "Approve the carrier or continue with your broker activation workflow";
 return {checks,blockers,warnings,actionCount,status:blockers?"REVIEW":warnings?"REVIEW":"PASS",readiness:Math.max(0,Math.min(100,100-blockers*22-warnings*8)),nextStep};
}
function extractJson(text:string){const c=text.replace(/```json/gi,"").replace(/```/g,"").trim(),s=c.indexOf("{"),e=c.lastIndexOf("}");if(s<0||e<=s)throw new Error("No JSON");return JSON.parse(c.slice(s,e+1));}

export async function POST(request:Request){
 let packet:Packet|null=null,source="",extractedFiles:string[]=[],documents:{name:string;text:string}[]=[];
 try{
  const ct=request.headers.get("content-type")||"";
  if(!ct.includes("multipart/form-data"))return NextResponse.json({error:"Upload one or more PDF documents to start a CarrierGate review."},{status:400});
  const form=await request.formData(); const files=form.getAll("files").filter((x):x is File=>x instanceof File);
  if(!files.length)return NextResponse.json({error:"No PDF files were uploaded."},{status:400});
  if(files.length>12)return NextResponse.json({error:"Upload up to 12 PDF documents per review."},{status:400});
  for(const file of files){
   if(file.size>8000000)throw new Error(`${file.name} is larger than the 8 MB limit.`);
   if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))throw new Error(`${file.name}: PDF files only.`);
   const parsed=await pdf(Buffer.from(await file.arrayBuffer())); const text=parsed.text?.trim()||"";
   if(!text)throw new Error(`${file.name} appears to be scanned/image-only. CarrierGate currently supports text-based PDFs; OCR support can be added separately.`);
   documents.push({name:file.name,text}); extractedFiles.push(file.name);
  }
  packet=extractPacket(documents); source="uploaded carrier PDFs + deterministic rules";
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process packet"},{status:400});}
 const evaluated=evaluate(packet); const key=process.env.OPENROUTER_API_KEY;
 if(!key)return NextResponse.json({...evaluated,summary:`CarrierGate analyzed ${extractedFiles.length} uploaded document(s) and found ${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} verification warning(s).`,ai:false,source,extractedFiles});
 const prompt=`You are CarrierGate, a freight carrier compliance operations agent. Write a concise operations brief from this uploaded-document evaluation. Never change, invent, or downgrade deterministic results. Return ONLY JSON with summary. Do not return nextStep. Evaluation: ${JSON.stringify(evaluated)}. Documents: ${JSON.stringify(extractedFiles)}. Mention live FMCSA verification when authority is unknown. Do not provide legal advice.`;
 try{const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":"https://swiftlabor-carrier-compliance.vercel.app","X-Title":"SwiftLabor CarrierGate"},body:JSON.stringify({model:"openrouter/free",messages:[{role:"user",content:prompt}],temperature:.1})});if(!r.ok)throw new Error();const d=await r.json(),ai=extractJson(d?.choices?.[0]?.message?.content||"");return NextResponse.json({...evaluated,summary:typeof ai.summary==="string"?ai.summary:`${evaluated.blockers} blocking exception(s) detected.`,ai:true,source:`${source} + OpenRouter`,extractedFiles});}
 catch{return NextResponse.json({...evaluated,summary:`CarrierGate analyzed ${extractedFiles.length} uploaded document(s). ${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} verification warning(s) remain. AI explanation was unavailable, so the deterministic result was preserved.`,ai:false,source,extractedFiles});}
}
