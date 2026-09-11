import { NextResponse } from "next/server";

const fallback = {
  status: "REVIEW",
  readiness: 62,
  summary: "Two blocking exceptions and one renewal risk were detected. Resolve the packet before the carrier becomes dispatch-ready.",
  checks: [
    { label: "Carrier identity", value: "MATCHED", tone: "pass", detail: "Legal name and carrier identifiers are consistent." },
    { label: "Operating authority", value: "VERIFIED", tone: "pass", detail: "Public FMCSA SAFER lookup is available." },
    { label: "Auto liability", value: "$1M", tone: "pass", detail: "Meets the broker requirement of $1,000,000." },
    { label: "Cargo coverage", value: "$50K", tone: "block", detail: "Below the $100,000 broker requirement." },
    { label: "COI expiration", value: "18 DAYS", tone: "warn", detail: "Renewal follow-up should start now." },
    { label: "Carrier agreement", value: "MISSING", tone: "block", detail: "Signed agreement is required before activation." },
  ],
  nextStep: "Request updated cargo coverage + signed carrier agreement",
};

export async function POST() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ ...fallback, ai: false, source: "demo rules" });

  const prompt = `You are CarrierGate, a freight carrier compliance operations agent. Analyze this sanitized demo packet and return ONLY valid JSON with keys status, readiness, summary, checks, nextStep. Requirements: auto liability >= $1M, cargo >= $100K, W-9 present, COI present and not expired, carrier agreement present, authority verified. Demo facts: Atlas Transport LLC; MC 123456; USDOT 987654; W-9 present; ACORD 25 present; auto liability $1M; cargo $50K; COI expires in 18 days; carrier agreement missing; authority public-source verification available. checks must be an array of objects with label,value,tone(pass|warn|block),detail. Be conservative: missing or below-threshold compliance items must block/review, never invent evidence.`;

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://swiftlabor-carrier-compliance.vercel.app", "X-Title": "SwiftLabor CarrierGate" },
      body: JSON.stringify({ model: "openrouter/free", messages: [{ role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } }),
    });
    if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty model response");
    const parsed = JSON.parse(content);
    return NextResponse.json({ ...parsed, ai: true, source: "OpenRouter" });
  } catch {
    return NextResponse.json({ ...fallback, ai: false, source: "verified demo fallback" });
  }
}
