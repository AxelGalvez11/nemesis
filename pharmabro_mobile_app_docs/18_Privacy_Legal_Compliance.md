# Privacy, Legal, and Compliance Notes — PharmaBro

## Important note

This is a product planning document, not legal advice. Before launch, have a healthcare/privacy attorney review the app, terms, privacy policy, data flows, and medical claims.

## Product positioning

PharmaBro should be positioned as:

- Educational.
- Source-backed.
- Drug information and evidence tracking.
- A tool to help users ask better questions.

PharmaBro should not be positioned as:

- AI doctor.
- Diagnosis tool.
- Treatment recommendation tool.
- Prescription decision tool.
- Substitute for clinician/pharmacist judgment.

## FDA risk considerations

The FDA uses a risk-based approach for device software functions and mobile medical applications. Software that diagnoses, treats, mitigates, or drives clinical decisions can trigger regulatory risk. Clinical decision support software has its own guidance, especially around whether users can independently review the basis for recommendations.

Practical implications:

- Keep the app educational.
- Show sources clearly.
- Let users independently review the basis for answers.
- Avoid opaque clinical recommendations.
- Avoid telling users to start/stop/change medications.
- Avoid claims that the app diagnoses or treats.
- Be careful with personalized medication advice.

## App Store considerations

Health and medical apps receive scrutiny around accuracy, safety, privacy, and claims. App Store materials should avoid diagnosis/treatment claims unless you have the regulatory basis to support them.

App Store listing should say:

> Educational information only. Not medical advice. Does not diagnose, treat, prescribe, or replace a healthcare professional.

## HIPAA considerations

HIPAA may not apply if PharmaBro is a direct-to-consumer app that is not acting on behalf of a covered entity or business associate. But HIPAA analysis depends on business model, integrations, customers, and data flows.

Even if HIPAA does not apply, health privacy expectations and FTC rules can still apply.

## FTC health privacy considerations

Consumer health apps may be subject to the FTC Health Breach Notification Rule and general FTC rules against unfair or deceptive practices. Privacy promises must match actual data handling.

Practical implications:

- Do not say “we never share data” unless true.
- Do not send health context to analytics/ad networks.
- Do not sell health data.
- Maintain breach response plan.
- Explain data collection clearly.
- Get consent for optional health context.
- Provide deletion/export.

## Privacy requirements

### Must-have

- Privacy policy.
- Terms of service.
- Account deletion.
- Health context deletion.
- Data export.
- Consent screen for optional health context.
- No model training on user health data by default.
- No sale of health data.
- Encryption in transit.
- Encryption at rest for sensitive profile fields.
- Limit analytics events that include health details.

### Should-have

- Separate health context table.
- Field-level encryption.
- Audit logs.
- Breach response process.
- Vendor review.
- Data processing agreements where needed.
- Privacy impact assessment.

## Data minimization

Collect only what is needed.

Avoid collecting:

- Full legal name unless necessary.
- Exact address.
- Insurance info.
- Medical record uploads in MVP.
- Images of prescriptions in MVP.
- Detailed lab history in MVP.
- Social security number.
- Payment card data directly; use payment provider.

## Health context consent copy

```text
My Health Context is optional. It can help PharmaBro make educational answers more relevant, such as noticing that a medication question may involve allergies, pregnancy, kidney disease, or another medication.

PharmaBro does not diagnose, treat, prescribe, or replace a healthcare professional. You can edit or delete this information anytime.
```

## Medical disclaimer copy

```text
PharmaBro provides educational information from public sources such as FDA labels, DailyMed, PubMed, and ClinicalTrials.gov. It does not provide medical advice, diagnosis, treatment, or prescribing decisions. Always consult a qualified healthcare professional for personal medical decisions.
```

## Safety escalation copy

For emergencies:

```text
This could be urgent. If you may be experiencing a medical emergency, call emergency services now. For possible poisoning or overdose in the U.S., contact Poison Control at 1-800-222-1222.
```

## Terms of service clauses to include

Attorney should draft final terms, but include concepts for:

- Educational use.
- No medical advice.
- No provider-patient relationship.
- User responsibility to consult professionals.
- Data accuracy limitations.
- Source limitations.
- Subscription terms.
- Acceptable use.
- No misuse for prescribing or emergency care.
- Limitation of liability.
- Arbitration/venue if appropriate.
- Account termination.
- Intellectual property.

## Privacy policy sections to include

- What data is collected.
- Health context details.
- How data is used.
- How sources and AI are used.
- Whether data is used for model training.
- Vendors/processors.
- Analytics.
- Data retention.
- Data deletion/export.
- Breach notification.
- Children/minors.
- State privacy rights.
- Contact email.

## Children/minors

Avoid targeting children. If pediatrics content exists, it should be educational and not personalized dosing. Consider age gate and terms restricting use under 13 or requiring guardian consent where applicable.

## High-risk topic rules

Require stricter response templates for:

- Pregnancy/breastfeeding.
- Pediatrics.
- Overdose.
- Suicidality/self-harm.
- Opioids.
- Benzodiazepines.
- Anticoagulants.
- Insulin.
- Immunosuppressants.
- Chemotherapy.
- Psychiatric medication changes.
- Research peptides/injectables.
- Drug sourcing questions.

## Red lines

The app should not:

- Give personalized dosing instructions.
- Tell users where to buy unapproved drugs/peptides.
- Tell users to inject research-use compounds.
- Recommend medication changes.
- Provide emergency triage beyond urgent routing.
- Hide source limitations.
- Use health data for ads.
