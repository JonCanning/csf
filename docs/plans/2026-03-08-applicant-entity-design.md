# Applicant Entity Design

## Summary

Rename `Recipient` → `Applicant`. Create/match Applicant when the apply form is submitted. Application links to Applicant via `applicantId` FK. Identity lives on Applicant; per-application choices (payment, meeting place, bank details) live on Application.

## Applicant Entity

- **Key**: `applicant-${normalizedPhone}-${normalizedName}` (deterministic composite)
- **Fields**: id, phone, name, email, createdAt, updatedAt
- **Events**: `ApplicantCreated`, `ApplicantUpdated`, `ApplicantDeleted`
- **Excludes**: paymentPreference, meetingPlace, bankDetails, notes (per-application)

## Application Changes

- `applicantId` becomes an explicit FK (already in events, now first-class)
- Keeps: paymentPreference, meetingPlace, bankDetails
- Identity resolution queries `Applicant` instead of `Recipient`

## Identity Resolution

```
apply(phone, name) →
  lookup applicant by (phone, name):
    - exact match → "matched", use existing applicantId
    - phone matches, name differs → "flagged" for review
    - no match → "new", create Applicant, generate applicantId
```

Flag review gains a "This is a different person" action that creates a new Applicant with the same phone but different name.

## What Changes

| Current | New |
|---------|-----|
| `Recipient` entity | `Applicant` entity |
| `RecipientRepository` | `ApplicantRepository` |
| `recipientRepo.getByPhone()` | `applicantRepo.getByPhoneAndName()` |
| Recipient created on new apply + managed by volunteers | Applicant created on apply, editable by volunteers |
| `/recipients/:id/edit` routes | `/applicants/:id/edit` routes |
| `recipient-${uuid}` stream | `applicant-${phone}-${name}` stream |
| bankDetails on Recipient | bankDetails on Application |

## What Stays The Same

- Event-sourced command/handler pattern
- Application decider logic (swaps identity source)
- Grant projection (still references applicantId)
- Eligibility/cooldown checks (still query by applicantId)
