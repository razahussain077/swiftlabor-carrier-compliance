import { NextResponse } from "next/server";
import pdf from "pdf-parse";

type Tone = "pass" | "warn" | "block";
type Packet = { legalName:string; mc:string; dot:string; w9Present:boolean; coiPresent:boolean; autoLiability:number; cargoCoverage:number; coiDaysRemaining:number|null; carrierAgreementPresent:boolean; authorityStatus:"active"|"inactive"|"unknown" };
type Check = { label:string; value:string; tone:Tone; detail:string };

function money(text:string, patterns:RegExp[]) { for(const re of patterns){const m=text.match(re); if(m)return Number(m[1].replace(/[$,]/g,""));} return 0; }
function extractPacket(text:string,names:string[]):Packet{
  const t=text.replace(/\s+/g," ");
  const mc=t.match(/\bMC(?:\s*(?:NO|NUMBER))?\s*[:#-]?\s*(\d{4,8})\b/i)?.[1]||"";
  const dot=t.match(/\bUSDOT(?:\s*(?:NO|NUMBER))?\s*[:#-]?\s*(\d{5,9})\b/i)?.[1]||"";
  const legal=t.match(/(?:legal name|named insured|insured name)\s*[:#-]\s*([A-Z0-9][A-Z0-9 .,&'/-]{2,80})/i)?.[1]?.trim()||"";
  const auto=money(t,[/(?:auto(?:mobile)?\s+liability|combined single limit|CSL)[^$]{0,60}\$([\d,]+)/i]);
  const cargo=money(t,[/(?:cargo|motor truck cargo)[^$]{0,60}\$([\d,]+)/i]);
  const date=t.match(/(?:expiration|expires|expiration date|policy expiration)[^0-9]{0,30}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1];
  let days:number|null=null; if(date){const d=new Date(date); if(!Number.isNaN(d.getTime()))days=Math.ceil((d.getTime()-Date.now())/86400000);}
  return {legalName:legal,mc,dot,w9Present:names.some(n=>/w-?9/i.test(n)),coiPresent:names.some(n=>/(coi|certificate.*insurance|acord)/i.test(n)),autoLiability:auto,cargoCoverage:cargo,coiDaysRemaining:days,carrierAgreementPresent:names.some(n=>/agreement/i.test(n)),authorityStatus:"unknown"};
}
function evaluate(p:Packet){
 const identity=Boolean(p.legalName&&p.mc&&p.dot);
 const checks:Check[]=[
  {label:"Carrier identity",value:identity?"MATCHED":"INCOMPLETE",tone:identity?"pass":"block",detail:identity?`Legal name, MC ${p.mc}, and USDOT ${p.dot} were extracted from the uploaded packet.`:"Legal name, MC number, and USDOT number could not all be extracted from the uploaded packet."},
  {label:"Operating authority",value:p.authorityStatus==="active"?"ACTIVE":p.authorityStatus==="inactive"?"INACTIVE":"CHECK REQUIRED",tone:p.authorityStatus==="active"?"pass":p.authorityStatus==="inactive"?"block":"warn",detail:p.authorityStatus==="unknown"?"Live FMCSA/SAFER verification is required; CarrierGate does not invent a verification result.":p.authorityStatus==="active"?"Authority verified as active.":"Authority is inactive. Do not activate the carrier."},
  {label:"Auto liability",value:p.autoLiability?`$${Math.round(p.autoLiability/1000)}K`:"NOT FOUND",tone:p.autoLiability>=1000000?"pass":"block",detail:p.autoLiability>=1000000?"Meets the configured $1,000,000 minimum.":"Coverage was not found or is below the configured $1,000,000 minimum."},
  {label:"Cargo coverage",value:p.cargoCoverage?`$${Math.round(p.cargoCoverage/1000)}K`:"NOT FOUND",tone:p.cargoCoverage>=100000?"pass":"block",detail:p.cargoCoverage>=100000?"Meets the configured $100,000 minimum.":"Coverage was not found or is below the configured $100,000 minimum."},
  {label:"COI expiration",value:!p.coiPresent?"MISSING":p.coiDaysRemaining===null?"NOT FOUND":`${p.coiDaysRemaining} DAYS`,tone:!p.coiPresent||p.coiDaysRemaining===null||p.coiDaysRemaining<=0?"block":p.coiDaysRemaining<=30?"warn":"pass",detail:!p.coiPresent?"Certificate of insurance is missing.":p.coiDaysRemaining===null?"A COI was uploaded, but an expiration date could not be extracted.":p.coiDaysRemaining<=0?"Certificate appears expired.":p.coiDaysRemaining<=30?"Renewal follow-up should start now.":"Certificate remains within the configured validity window."},
  {label:"Required documents",value:p.w9Present&&p.coiPresent&&p.carrierAgreementPresent?"COMPLETE":"INCOMPLETE",tone:p.w9Present&&p.coiPresent&&p.carrierAgreementPresent?"pass":"block",detail:p.w9Present&&p.coiPresent&&p.carrierAgreementPresent?"W-9, COI, and carrier agreement are present.":`Missing: ${[!p.w9Present?"W-9":"",!p.coiPresent?"COI":"",!p.carrierAgreementPresent?"carrier agreement":""].filter(Boolean).join(", ")}.`}
 ];
 const blockers=checks.filter(c=>c.tone==="block").length,warnings=checks.filter(c=>c.tone==="warn").length;
 return {checks,blockers,warnings,status:blockers?"REVIEW":warnings?"REVIEW":"PASS",readiness:Math.max(0,Math.min(100,100-blockers*22-warnings*8)),nextStep:blockers?`Resolve ${blockers} blocking ${blockers===1?"exception":"exceptions"} before activation`:warnings?"Complete the remaining verification checks before activation":"Approve the carrier or continue with your broker activation workflow"};
}
function extractJson(text:string){const c=text.replace(/```json/gi,"").replace(/```/g,"").trim(),s=c.indexOf("{"),e=c.lastIndexOf("}");if(s<0||e<=s)throw new Error("No JSON");return JSON.parse(c.slice(s,e+1));}

export async function POST(request:Request){
 let packet:Packet|null=null,source="",extractedFiles:string[]=[],extractedText="";
 try{
  const ct=request.headers.get("content-type")||"";
  if(!ct.includes("multipart/form-data"))return NextResponse.json({error:"Upload one or more PDF documents to start a CarrierGate review."},{status:400});
  const form=await request.formData(); const files=form.getAll("files").filter((x):x is File=>x instanceof File);
  if(!files.length)return NextResponse.json({error:"No PDF files were uploaded."},{status:400});
  for(const file of files){
   if(file.size>8000000)throw new Error(`${file.name} is larger than the 8 MB limit.`);
   if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))throw new Error(`${file.name}: PDF files only.`);
   const parsed=await pdf(Buffer.from(await file.arrayBuffer())); const text=parsed.text?.trim()||"";
   if(!text)throw new Error(`${file.name} appears to be scanned/image-only. Text extraction could not read it.`);
   extractedText+=`\n--- ${file.name} ---\n${text}`; extractedFiles.push(file.name);
  }
  packet=extractPacket(extractedText,extractedFiles); source="uploaded PDF packet + deterministic rules";
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to process packet"},{status:400});}
 const evaluated=evaluate(packet); const key=process.env.OPENROUTER_API_KEY;
 if(!key)return NextResponse.json({...evaluated,summary:`CarrierGate analyzed ${extractedFiles.length} uploaded document(s) and found ${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} warning(s).`,ai:false,source,extractedFiles});
 const prompt=`You are CarrierGate, a freight carrier compliance operations agent. Write a concise operations brief from this uploaded-document evaluation. Never change, invent, or downgrade deterministic results. Return ONLY JSON with summary and nextStep. Evaluation: ${JSON.stringify(evaluated)}. Documents: ${JSON.stringify(extractedFiles)}. Mention live FMCSA verification when authority is unknown. Do not provide legal advice.`;
 try{const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","HTTP-Referer":"https://swiftlabor-carrier-compliance.vercel.app","X-Title":"SwiftLabor CarrierGate"},body:JSON.stringify({model:"openrouter/free",messages:[{role:"user",content:prompt}],temperature:.1})});if(!r.ok)throw new Error();const d=await r.json(),ai=extractJson(d?.choices?.[0]?.message?.content||"");return NextResponse.json({...evaluated,summary:typeof ai.summary==="string"?ai.summary:`${evaluated.blockers} blocking exception(s) detected.`,nextStep:typeof ai.nextStep==="string"?ai.nextStep:evaluated.nextStep,ai:true,source:`${source} + OpenRouter`,extractedFiles});}
 catch{return NextResponse.json({...evaluated,summary:`CarrierGate analyzed ${extractedFiles.length} uploaded document(s). ${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} warning(s) remain. AI explanation was unavailable, so the deterministic result was preserved.`,ai:false,source,extractedFiles});}
}
