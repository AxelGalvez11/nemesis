# DeepSeek API — Launch-Gate Compliance Review

**Context:** US-based consumer **health-information** mobile app. Sends free-text user health questions (potentially sensitive, e.g. "can I take ibuprofen with my lisinopril") to an LLM for source-grounded answer generation. Provider-agnostic OpenAI-compatible client (configurable base URL + key, JSON/structured outputs). Decision: **KEEP DeepSeek or SWAP**.

**Date:** 2026-06-04. Every factual claim is cited inline with a primary or authoritative URL. Prices are approximate and dated.

---

## 1. Data Residency / Jurisdiction

**Where it processes/stores data — PRC, no non-CN option.** DeepSeek's privacy policy states plainly, under *"Where We Store Your Personal Data"*: *"To provide you with our services, we directly collect, process and store your Personal Data in People's Republic of China."* ([privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)) API requests to `https://api.deepseek.com` are served from DeepSeek's infrastructure in China; the company is **Hangzhou DeepSeek Artificial Intelligence Co., Ltd.**, and the Open Platform ToS names Hangzhou as the seat of jurisdiction (§10.2). ([API ToS](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)) There is **no documented US or EU endpoint and no enterprise data-residency option** on DeepSeek's first-party API. (Note: the open-weights *model* can be run US-side via third parties — that is a swap mechanism, see §4, **not** a DeepSeek residency option.)

**Retention — indefinite/"as necessary."** Under *"How Long Do We Keep Your Personal Data"*: *"We retain Personal Data for as long as necessary to provide our Services and for the other purposes set out in this Privacy Policy."* No fixed maximum is given; retention extends for "legitimate business interest," legal obligations, and to process terms violations. ([privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html))

**Government / third-party access.** Under *"Law Enforcement and Parties with Other Legal Rights,"* DeepSeek *"may access, preserve, and share … Personal Data … with law enforcement agencies, public authorities … or other third parties"* where it believes necessary to *"comply with applicable law, legal process or government requests."* Because data sits in the PRC, "applicable law" and "government requests" mean **PRC** law and authorities. ([privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html))

**PRC-law implications (the core residency risk):**
- **2017 National Intelligence Law, Art. 7:** *"all organizations and citizens shall support, assist, and cooperate with national intelligence efforts in accordance with law."* ([China Law Translate — full text](https://www.chinalawtranslate.com/en/national-intelligence-law-of-the-p-r-c-2017/)) US government analyses read this as compelling PRC-based companies to hand over data on demand, including data held overseas, often under secrecy obligations. ([DHS Data Security Business Advisory](https://www.dhs.gov/sites/default/files/publications/20_1222_data-security-business-advisory.pdf); [ODNI/NCSC bulletin on PRC laws](https://www.dni.gov/files/NCSC/documents/SafeguardingOurFuture/FINAL_NCSC_SOF_Bulletin_PRC_Laws.pdf))
- **PIPL + Data Security Law** form the broader PRC data regime governing how this data is processed and disclosed; the data lives inside that regime, not under US/EU protections. ([Hawksford PIPL guide](https://www.hawksford.com/insights-and-guides/china-pipl-compliance-guide); [ICAS overview](https://chinaus-icas.org/research/chinas-data-governance-and-cybersecurity-regime/))

> **Q1 verdict:** API data is processed and stored in the PRC, retained indefinitely by policy, subject to PRC government-access law (NIL Art. 7), with **no** US/EU endpoint or residency option on DeepSeek's first-party API.

---

## 2. Training on Inputs

**There is no documented API-level no-training guarantee or zero-retention mode.** Treat API inputs as potentially used for training.

- The **Privacy Policy** (which by its terms governs all DeepSeek "Services") lists, among corporate-group support purposes, *"foundation model training and optimization."* ([privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html))
- The **consumer Terms of Use** are training-on-by-default: §4.3 — *"we may, to a minimal extent, use Inputs and Outputs to … develop or improve the Services or the underlying technologies."* The only opt-out is a **consumer-app UI toggle** — *"you can opt out by turning off 'Improve the model for everyone'"* — and that ToU's §1.1 states it spans *"websites, applications …, SDKs …, [and] APIs."* ([Terms of Use](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html))
- The **Open Platform (API) ToS** is silent on training and provides **no** API-level opt-out or zero-retention setting. ([API ToS](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html))

The missing training clause in the API ToS is **not** a no-training commitment. Combined with a Privacy Policy that names model training and a consumer ToS (claiming API scope) that is opt-out-by-toggle with **no documented API equivalent**, the gate-appropriate reading is: **assume API inputs/outputs may be used for training; there is no zero-retention mode for the API.**

> **Q2 verdict:** No documented API opt-out or ZDR. Inputs should be assumed usable for model training/improvement.

---

## 3. Commercial Use + Content Rules

- **Commercial use is permitted.** API ToS §1.1 lets you *"integrate the capabilities of the DeepSeek models into various downstream systems, applications, or functionalities … providing services to both internal and external end users"* — covers a paid consumer app. ([API ToS](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)) You retain rights to Inputs; Output rights are assigned to you (§4.2).
- **Medical-output disclaimer.** §8.1: *"when using this Service to consult on medical, legal, financial, and other professional issues, the Output does not constitute any advice or commitment"* and *"shall not form the basis for further actions or omissions."* This is directly on point for a health-Q&A app: DeepSeek expressly disclaims medical reliability of outputs. ([API ToS §8.1](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html))
- **PRC content-compliance / governing law.** §10.1: the Terms are governed by *"the laws of the People's Republic of China in the mainland."* PRC-law content-control norms therefore apply to the service and its outputs, and disputes are heard in Hangzhou (§10.2) — a poor posture for a US consumer product and a source of unpredictable output behavior on sensitive topics. ([API ToS §10](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html))

> **Q3 verdict:** Commercial use OK; but DeepSeek disclaims medical reliability of outputs, and the contract is PRC-governed with PRC content-compliance exposure.

---

## 4. Swap Alternatives (drop-in via OpenAI-compatible client)

DeepSeek's own API is *"compatible with OpenAI"* at base URL `https://api.deepseek.com`. ([DeepSeek API docs](https://api-docs.deepseek.com/)) For each alternative: **(a)** OpenAI-Chat-Completions compatibility, **(b)** US/EU residency, **(c)** no-training / ZDR / HIPAA BAA, **(d)** approx. price/1M tokens (input/output), as of 2026-06.

> **Decisive fact:** the **DeepSeek model itself** is hosted in US data centers by **AWS Bedrock** and **Azure AI Foundry (via Fireworks)** — so you can keep the model (cost/quality, near-zero prompt drift) and drop the PRC API. ([Azure Foundry DeepSeek catalog](https://ai.azure.com/catalog/models/FW-DeepSeek-V3.2); [model availability — Bedrock/Foundry](https://modelavailability.com/models/deepseek/deepseek-v3-1))

**DeepSeek (baseline):** native OpenAI-compat. PRC-only, no residency. No documented no-train/ZDR/BAA. **~$0.14 in / $0.28 out** (V4 Flash; deepseek-chat alias). ([pricing](https://api-docs.deepseek.com/quick_start/pricing))

**OpenAI:** (a) Native — it *is* the reference API. (b) US/EU residency on enterprise tiers. (c) No training on API data by default; ZDR on eligible endpoints by request; **BAA available** (email baa@openai.com). (d) Varies by model; mid-tier roughly **~$0.15–$2.50 in / $0.60–$10 out**, approx. ([enterprise privacy](https://openai.com/enterprise-privacy/); [BAA](https://help.openai.com/en/articles/8660679-how-can-i-get-a-business-associate-agreement-baa-with-openai))

**Azure OpenAI / Azure AI Foundry:** (a) Compat but **not pure base_url** — needs `AzureOpenAI` client (deployment name + api-version). (b) Strong region pinning / data residency. (c) No-training default (Microsoft DPA), modified-abuse-monitoring to drop the retention window, **BAA available**. Also hosts DeepSeek via Fireworks. (d) Model-dependent; comparable to OpenAI list. ([Azure data controls summary](https://meetily.ai/llm-privacy/azure); [Foundry models](https://azure.microsoft.com/en-us/products/ai-foundry/models))

**AWS Bedrock:** (a) **Not native** Chat-Completions — use AWS SDK (`Converse`/`InvokeModel`) or its OpenAI-compat endpoint. (b) Regional residency (pick US region). (c) Inputs/outputs **not used to train** Bedrock or third-party models; **HIPAA-eligible under AWS BAA**. Hosts DeepSeek. (d) Pass-through model pricing. ([HIPAA-eligible providers incl. AWS](https://callsphere.ai/blog/vw1f-hipaa-eligible-model-providers-2026))

**Google Vertex AI:** (a) **Not native** — Gemini API / Vertex SDK, or its OpenAI-compat endpoint. (b) Regional residency. (c) No training on customer data; **BAA available** (note: not FedRAMP-High like Azure/Bedrock). (d) Gemini-family pricing, model-dependent. ([HIPAA-eligible providers incl. Google](https://callsphere.ai/blog/vw1f-hipaa-eligible-model-providers-2026))

**Together AI:** (a) **Native** OpenAI-compat base URL; hosts DeepSeek open weights. (b) US-based inference. (c) **HIPAA-BAA / ZDR status could not be verified from primary sources — confirm directly with Together before relying on it.** (d) DeepSeek-class open weights ~**$0.20–$1.25 in/out**, approx. ([Together compat/catalog — general]( https://www.together.ai/))
  *Unverified cell — vendor confirmation required.*

**Fireworks AI:** (a) **Native** OpenAI-compat (`https://api.fireworks.ai/inference/v1`); hosts DeepSeek (incl. V4) and powers DeepSeek on Azure Foundry. (b) US-based. (c) **SOC 2 Type II + HIPAA compliant, BAA available**; does **not** log/store prompt or generation data for open models absent opt-in (ZDR-style), TLS 1.2+/AES-256. (d) DeepSeek-class open weights ~**$0.20–$0.90 in/out**, approx. ([Fireworks data security](https://docs.fireworks.ai/guides/security_compliance/data_security); [SOC2+HIPAA announcement](https://fireworks.ai/blog/fireworks-ai-achieves-soc-2-type-ii-and-hipaa-compliance))

**Groq:** (a) **Native** OpenAI-compat (`https://api.groq.com/openai/v1`). (b) US-based. (c) **BAA available**; ZDR is a Console setting for eligible customers — **but the BAA excludes preview/beta features and "compound AI systems"** (don't use those for PHI). (d) Very low per-token cost on supported open models, approx. ([Groq services agreement / BAA](https://console.groq.com/docs/legal/services-agreement); [Groq trust FAQ](https://trust.groq.com/faq))

**Anthropic (Claude):** (a) **Not native** — has an OpenAI-compat shim, else native Messages API. (b) US/EU. (c) Commercial Terms: **no training on Customer Content**; **ZDR available**; **BAA available** for commercial customers. (d) Haiku-class ~**$0.25–$1 in / $1.25–$5 out**; Sonnet higher, approx. ([API & data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention); [BAA](https://privacy.claude.com/en/articles/8114513-business-associate-agreements-baa-for-commercial-customers))

---

## Regulatory context for *this* app (why residency matters even without HIPAA)

- **HIPAA likely does NOT directly apply.** A direct-to-consumer self-help health-info app is generally **not** a HIPAA covered entity or business associate. So a BAA is a **B2B enabler / strong best-practice signal**, **not** a strict legal mandate here. Don't hang the decision on HIPAA alone.
- **Washington My Health My Data Act (MHMDA) is the sharp edge.** "Consumer health data" is defined **very broadly** (incl. data extrapolated by algorithms), it carries a **private right of action** via the WA Consumer Protection Act, and it can reach **non-Washington residents whose data is merely processed in Washington.** A consumer health-Q&A app is squarely in scope. ([Goodwin MHMDA alert](https://www.goodwinlaw.com/en/insights/publications/2024/03/alerts-technology-hltc-my-health-my-data-act-mhmda); [Sidley — private right of action](https://www.sidley.com/en/insights/newsupdates/2023/05/washington-state-enacts-my-health-my-data-act); [RCW 19.373](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true))
- **FTC Health Breach Notification Rule (2024)** expressly covers **health apps not subject to HIPAA**, with breach-notice duties to consumers and the FTC. ([FTC final-rule guidance](https://www.ftc.gov/business-guidance/blog/2024/04/updated-ftc-health-breach-notification-rule-puts-new-provisions-place-protect-users-health-apps))

Sending sensitive health questions to PRC-resident infrastructure with indefinite retention, assumed training use, and NIL-Art.7 state-access exposure is hard to defend under MHMDA's "unfair/deceptive practice" lens and the FTC's expectations for health apps — independent of HIPAA.

---

## BOTTOM LINE

**SWAP. Keeping DeepSeek's first-party (`api.deepseek.com`) API is not defensible at launch for a US consumer app handling sensitive health questions.** The disqualifiers: (1) all request data is **processed and stored in the PRC** with **no** US/EU residency option; (2) **indefinite retention** and **no documented API-level no-training or zero-retention mode** (assume inputs train the model); (3) **PRC governing law + NIL Art. 7** state-access exposure; (4) a **PRC-governed contract that disclaims medical reliability of outputs**. Against **MHMDA** (broad scope + private right of action, reaches data processed in WA) and the **FTC Health Breach Notification Rule**, that profile is a launch-gate failure.

**Single best drop-in target: Fireworks AI, running the DeepSeek model in US data centers.** Rationale:
1. **Lowest migration friction & near-zero prompt drift** — it serves the **same DeepSeek model**, so answer quality/behavior and cost stay close to today's baseline. ([Foundry/Fireworks DeepSeek](https://ai.azure.com/catalog/models/FW-DeepSeek-V3.2))
2. **Native OpenAI-Chat-Completions compatibility** — drop-in via `base_url` + key with your existing provider-agnostic client; JSON/structured outputs preserved.
3. **Compliance posture fit** — **US infrastructure, SOC 2 Type II + HIPAA, BAA available, no prompt/generation logging for open models absent opt-in.** ([data security](https://docs.fireworks.ai/guides/security_compliance/data_security); [SOC2+HIPAA](https://fireworks.ai/blog/fireworks-ai-achieves-soc-2-type-ii-and-hipaa-compliance))
4. **Cost stays competitive** (~$0.20–$0.90/1M, approx.), unlike jumping to a frontier proprietary model.

**Contingencies:** the recommendation is sound **provided you (a) sign the Fireworks BAA and (b) enable/confirm zero-data-retention** (ZDR reads as opt-in/config, not automatic). If you prefer not to run open weights, the **enterprise-defensible fallbacks are Azure OpenAI or OpenAI direct** (mature DPAs, residency, BAA, no-train-by-default) — at higher model cost and, for Azure, a small client adapter. **Groq** is a strong low-latency option but its BAA excludes preview/"compound AI" features — keep PHI off those. **Avoid for this use case: DeepSeek first-party API (PRC).**
