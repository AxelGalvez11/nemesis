# Design System — PharmaBro

## Brand personality

- Clear.
- Evidence-backed.
- Calm.
- Modern.
- Slightly bold.
- Not sterile or boring.
- Not gimmicky.
- Not “AI doctor.”

## Visual direction

PharmaBro should feel like:

- A clean health intelligence app.
- A modern evidence dashboard.
- A medication encyclopedia.
- A source-backed AI assistant.

Avoid:

- Hospital-only design.
- Overly playful graphics for serious warnings.
- Dark pattern paywalls.
- Fear-based health messaging.

## Color system

Suggested palette:

| Role | Description |
|---|---|
| Primary | Deep blue or teal for trust |
| Secondary | Purple/indigo for intelligence |
| Success | Green for approved/strong evidence |
| Warning | Amber for caution/moderate evidence |
| Danger | Red for boxed warnings/urgent safety |
| Neutral | Gray/white background system |

Evidence colors:

- Very Strong: dark green.
- Strong: green.
- Moderate: amber.
- Weak: orange.
- Very Weak: red-orange.
- Unknown: gray.

Do not rely on color alone. Always include text labels.

## Typography

- Use a highly readable sans-serif.
- Suggested: Inter, SF Pro, or system default.
- Drug names should be clear and prominent.
- Long medical explanations need comfortable line spacing.

## Components

### Evidence badge

```text
[Evidence: Moderate]
```

States:

- Very Strong.
- Strong.
- Moderate.
- Weak.
- Very Weak.
- Unknown.

### Approval status pill

```text
[Approved] [Investigational] [Research-use / insufficient evidence] [Supplement]
```

### Citation pill

```text
[DailyMed: Warnings] [PubMed: RCT] [ClinicalTrials.gov: NCT123]
```

### Drug card

Fields:

- Name.
- Class/status.
- Evidence score.
- Main update.
- Follow button.

### Watchlist row

Fields:

- Item name.
- Item type.
- Latest update.
- Alert type icon.
- Time since update.

### Source card

Fields:

- Source type.
- Title.
- Date.
- Section.
- Why it matters.
- Open source button.

## UX writing rules

Use:

- “Educational information.”
- “Ask your doctor/pharmacist.”
- “Evidence is limited.”
- “No FDA-approved label found.”
- “Investigational.”
- “Research-use / insufficient human evidence.”

Avoid:

- “You should take…”
- “This will cure…”
- “Safe for everyone.”
- “No risk.”
- “Guaranteed.”
- “Doctor-approved” unless verified and compliant.
- “AI diagnosis.”

## Answer layout

Recommended answer sections:

1. Bottom line.
2. Evidence grade.
3. What we know.
4. What we do not know.
5. Safety notes.
6. Questions to ask your clinician/pharmacist.
7. Sources.

## Accessibility

- WCAG-friendly contrast.
- Dynamic text support.
- Screen-reader labels for badges.
- Do not communicate warnings only via color.
- Tap targets at least 44x44 px.
- Avoid dense paragraphs.
- Use plain-language headings.

## Iconography

- Search.
- Pill/medication.
- Trial/beaker.
- Document/source.
- Bell/watchlist.
- Shield/safety.
- Compare arrows.
- Graduation cap for student mode later.

## Motion

Use minimal motion:

- Loading skeletons.
- Smooth tab transitions.
- Source viewer slide-up.
- Watchlist add confirmation.

Avoid animations that make safety-critical information feel playful.

## Design priorities

1. Trust.
2. Readability.
3. Source visibility.
4. Speed.
5. Evidence hierarchy.
6. Easy watchlist action.
