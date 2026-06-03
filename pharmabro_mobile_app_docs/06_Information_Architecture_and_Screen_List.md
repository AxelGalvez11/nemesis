# Information Architecture and Screen List — PharmaBro

## Top-level navigation

Recommended mobile tabs:

1. **Ask**
2. **Explore**
3. **Watchlist**
4. **Classes**
5. **Profile**

Alternative for simpler MVP:

1. **Ask**
2. **Explore**
3. **Watchlist**
4. **Profile**

Medication Classes can live inside Explore until it deserves its own tab.

## Information architecture

```text
App
├── Ask
│   ├── Chat input
│   ├── Answer
│   ├── Citations
│   ├── Follow-up questions
│   └── Save / Add to watchlist
├── Explore
│   ├── Search
│   ├── Popular drugs
│   ├── Popular peptides
│   ├── Popular supplements
│   ├── Trending trials
│   ├── Comparisons
│   └── Medication classes
├── Drug/Compound Page
│   ├── Overview
│   ├── FDA/DailyMed label
│   ├── Evidence
│   ├── PubMed
│   ├── Clinical trials
│   ├── Risks/unknowns
│   ├── Related drugs/classes
│   └── Add to watchlist
├── Watchlist
│   ├── My followed items
│   ├── Updates
│   ├── Alert settings
│   └── Weekly digest
├── Classes
│   ├── Class list
│   ├── Class page
│   ├── Drugs in class
│   ├── Warnings/interactions
│   └── Compare
└── Profile
    ├── Account
    ├── My Health Context
    ├── Subscription
    ├── Privacy
    ├── Export/delete data
    └── Help/feedback
```

## Screen list

### Onboarding

- Welcome screen
- Educational-use positioning screen
- Interest selection
- Optional sign up
- Optional My Health Context intro
- Notification permission prompt

### Ask

- Ask home
- Chat answer
- Source viewer
- Follow-up suggestions
- Saved answers
- Safety/urgent-care routing screen

### Explore

- Explore home
- Search results
- Popular drugs
- Popular peptides
- Popular supplements
- Trending clinical trial drugs
- Compare index
- Medication class index

### Drug/Compound

- Drug overview
- Label summary
- Warnings and precautions
- Adverse reactions
- Interactions
- Evidence summary
- PubMed paper list
- Clinical trials list
- Related drugs
- Add to watchlist modal

### Watchlist

- Watchlist home
- Watchlist item detail
- Update feed
- Weekly digest
- Alert preferences
- Paywall for more followed items

### Medication Classes

- Class list
- Class detail
- Drug list
- Counseling points
- Monitoring
- Serious warnings
- Compare classes

### Profile/Settings

- Profile home
- My Health Context
- Manage medications
- Manage supplements
- Manage allergies
- Data export
- Delete account
- Privacy policy
- Terms
- Subscription
- Contact support

## Key screen states

Every major screen should define:

- Loading state.
- Empty state.
- Error state.
- No source found state.
- Source outdated state.
- Paywall state.
- Guest mode state.
- Offline/cached state.

## Empty-state examples

### Watchlist empty state

> Follow drugs, clinical trials, medication classes, or PubMed keywords. PharmaBro will notify you when something important changes.

### Drug page no label state

> No FDA/DailyMed label was found. This may mean the compound is investigational, not FDA-approved, a supplement, or not indexed under this name.

### PubMed no results state

> No matching PubMed papers were found for this query. Try a generic name, alternate spelling, or related drug class.
