import { NextResponse } from "next/server";

type Tone = "pass" | "warn" | "block";
type Packet = {
  legalName: string;
  mc: string;
  dot: string;
  w9Present: boolean;
  coiPresent: boolean;
  autoLiability: number;
  cargoCoverage: number;
  coiDaysRemaining: number;
  carrierAgreementPresent: boolean;
  authorityStatus: "active" | "inactive" | "unknown";
};

type Check = { label: string; value: string; tone: Tone; detail: string };

const DEMO_PACKET: Packet = {
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

function evaluate(packet: Packet) {
  const checks: Check[] = [
    {
      label: "Carrier identity",
      value: packet.legalName && packet.mc && packet.dot ? "MATCHED" : "INCOMPLETE",
      tone: packet.legalName && packet.mc && packet.dot ? "pass" : "block",
      detail: packet.legalName && packet.mc && packet.dot
        ? `Legal name, MC ${packet.mc}, and USDOT ${packet.dot} are present in the packet.`
        : "Legal name, MC number, and USDOT number are required.",
    },
    {
      label: "Operating authority",
      value: packet.authorityStatus === "active" ? "ACTIVE" : packet.authorityStatus === "inactive" ? "INACTIVE" : "CHECK REQUIRED",
      tone: packet.authorityStatus === "active" ? "pass" : packet.authorityStatus === "inactive" ? "block" : "warn",
      detail: packet.authorityStatus === "active"
        ? "Authority status was supplied as active by the verification source."
        : packet.authorityStatus === "inactive"
          ? "Authority is reported inactive. Do not activate the carrier."
          : "Live FMCSA/SAFER verification is required before final approval; CarrierGate does not invent a verification result.",
    },
    {
      label: "Auto liability",
      value: `$${Math.round(packet.autoLiability / 1000)}K`,
      tone: packet.autoLiability >= 1_000_000 ? "pass" : "block",
      detail: packet.autoLiability >= 1_000_000 ? "Meets the demo broker requirement of $1,000,000." : "Below the $1,000,000 broker requirement.",
    },
    {
      label: "Cargo coverage",
      value: `$${Math.round(packet.cargoCoverage / 1000)}K`,
      tone: packet.cargoCoverage >= 100_000 ? "pass" : "block",
      detail: packet.cargoCoverage >= 100_000 ? "Meets the demo broker requirement of $100,000." : "Below the $100,000 broker requirement.",
    },
    {
      label: "COI expiration",
      value: `${packet.coiDaysRemaining} DAYS`,
      tone: !packet.coiPresent ? "block" : packet.coiDaysRemaining <= 0 ? "block" : packet.coiDaysRemaining <= 30 ? "warn" : "pass",
      detail: !packet.coiPresent ? "Certificate of insurance is missing." : packet.coiDaysRemaining <= 0 ? "Certificate appears expired." : packet.coiDaysRemaining <= 30 ? "Renewal follow-up should start now." : "Certificate remains within the configured validity window.",
    },
    {
      label: "Required documents",
      value: packet.w9Present && packet.coiPresent && packet.carrierAgreementPresent ? "COMPLETE" : "INCOMPLETE",
      tone: packet.w9Present && packet.coiPresent && packet.carrierAgreementPresent ? "pass" : "block",
      detail: packet.w9Present && packet.coiPresent && packet.carrierAgreementPresent
        ? "W-9, COI, and carrier agreement are present."
        : `Missing: ${[
            !packet.w9Present ? "W-9" : "",
            !packet.coiPresent ? "COI" : "",
            !packet.carrierAgreementPresent ? "carrier agreement" : "",
          ].filter(Boolean).join(", ") || "none"}.`,
    },
  ];

  const blockers = checks.filter((c) => c.tone === "block").length;
  const warnings = checks.filter((c) => c.tone === "warn").length;
  const status = blockers > 0 ? "REVIEW" : warnings > 0 ? "REVIEW" : "PASS";
  const readiness = Math.max(0, Math.min(100, 100 - blockers * 22 - warnings * 8));
  const nextStep = blockers > 0
    ? `Resolve ${blockers} blocking ${blockers === 1 ? "exception" : "exceptions"} before activation`
    : warnings > 0
      ? "Complete the remaining verification checks before activation"
      : "Approve the carrier or continue with your broker activation workflow";

  return { checks, blockers, warnings, status, readiness, nextStep };
}

function extractJson(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object returned");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: Request) {
  let packet = DEMO_PACKET;
  try {
    const body = await request.json();
    if (body?.packet) packet = { ...DEMO_PACKET, ...body.packet } as Packet;
  } catch {
    // Empty body is valid for the built-in sanitized demo packet.
  }

  const evaluated = evaluate(packet);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return NextResponse.json({
      status: evaluated.status,
      readiness: evaluated.readiness,
      summary: `${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} warning(s) detected from the supplied packet.`,
      checks: evaluated.checks,
      nextStep: evaluated.nextStep,
      ai: false,
      source: "deterministic compliance rules",
    });
  }

  const prompt = `You are CarrierGate, a freight carrier compliance operations agent. Convert the supplied deterministic compliance evaluation into a concise operations brief. Never change, invent, or downgrade a rule result. Return ONLY valid JSON with keys summary and nextStep. Packet: ${JSON.stringify(packet)}. Deterministic evaluation: ${JSON.stringify(evaluated)}. State that live authority verification is still required when its status is unknown. Do not provide legal advice.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://swiftlabor-carrier-compliance.vercel.app",
        "X-Title": "SwiftLabor CarrierGate",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty model response");
    const ai = extractJson(content);

    return NextResponse.json({
      status: evaluated.status,
      readiness: evaluated.readiness,
      summary: typeof ai.summary === "string" ? ai.summary : `${evaluated.blockers} blocking exception(s) detected from the supplied packet.`,
      checks: evaluated.checks,
      nextStep: typeof ai.nextStep === "string" ? ai.nextStep : evaluated.nextStep,
      ai: true,
      source: "OpenRouter + deterministic rules",
    });
  } catch {
    return NextResponse.json({
      status: evaluated.status,
      readiness: evaluated.readiness,
      summary: `${evaluated.blockers} blocking exception(s) and ${evaluated.warnings} warning(s) detected. AI explanation was unavailable, so CarrierGate preserved the deterministic compliance result.`,
      checks: evaluated.checks,
      nextStep: evaluated.nextStep,
      ai: false,
      source: "deterministic compliance fallback",
    });
  }
}
