# CarrierGate — SwiftLabor Agent 02

CarrierGate is SwiftLabor's AI operations demo for carrier compliance and onboarding.

### Workflow
Carrier packet → document readiness → cross-document checks → public-source evidence → exception detection → activation recommendation → human approval.

### Demo safeguards
- Uses sanitized sample values only.
- Uses public form/reference sources for the W-9 and ACORD certificate.
- Public FMCSA SAFER is linked as an evidence source; the demo does not claim live verification for the sanitized sample record.
- Final carrier activation remains a human decision.

Built with Next.js, React, TypeScript and Lucide.
