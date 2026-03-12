# Volunteer User Guide

This guide covers everything volunteers need to operate the grant lottery system from month start to month end.

---

## Table of Contents

1. [Initial Login](#1-initial-login)
2. [Managing Volunteers](#2-managing-volunteers)
3. [Opening the Lottery](#3-opening-the-lottery)
4. [Reviewing Applications](#4-reviewing-applications)
5. [Closing the Lottery & Drawing Winners](#5-closing-the-lottery--drawing-winners)
6. [Grant Workflow — Bank Transfer](#6-grant-workflow--bank-transfer)
7. [Grant Workflow — Cash Handover](#7-grant-workflow--cash-handover)
8. [Handling Unresponsive Winners](#8-handling-unresponsive-winners)
9. [Managing Applicants](#9-managing-applicants)
10. [Key Rules Reference](#10-key-rules-reference)

---

## 1. Initial Login

### First-Time Login

1. Navigate to the application URL
2. You will be redirected to `/login`
3. Enter your **name** and **password** (provided by an admin)
4. If your account requires a password reset, you will be redirected to `/change-password` automatically
5. Set a new password (minimum 4 characters) and submit
6. You are now logged in and redirected to the dashboard

### Subsequent Logins

1. Go to `/login`
2. Enter your name and password
3. You are redirected to the dashboard

### Logout

Click **Logout** in the navigation. Your session is cleared immediately.

> **Note:** If your account has been disabled by an admin, you will not be able to log in. Contact another admin to re-enable your account.

---

## 2. Managing Volunteers

> **Admin only.** Only volunteers with admin status can manage volunteer accounts.

### Creating a New Volunteer

1. Go to **Volunteers** in the navigation
2. Click **New Volunteer**
3. Fill in:
   - Name (required)
   - Email
   - Phone
   - Password (the volunteer must change this on first login)
4. Submit — the account is created with `requiresPasswordReset` enabled, so the volunteer will be prompted to set their own password on first login

### Editing a Volunteer

1. Go to **Volunteers**
2. Click the volunteer's name
3. Update their details and save

### Disabling / Enabling a Volunteer

- **Disable**: Go to **Volunteers** → click the volunteer → click **Disable**. The volunteer cannot log in while disabled.
- **Enable**: Go to **Volunteers** → click the volunteer → click **Enable**.

### Viewing Volunteer History

Go to **Volunteers** → click the volunteer → click **History** to see their activity log.

---

## 3. Opening the Lottery

At the start of each month's application period, a volunteer must open the application window.

1. Go to **Lottery** in the navigation
2. The current window status is displayed (e.g. _No window open_)
3. Click **Open Application Window**
4. The window is now open — applicants can submit applications via the public form at `/apply`

> **What happens when the window opens:** The system begins accepting applications. Applications submitted before the window opens are automatically rejected with the reason _window closed_.

### How Applicants Apply

Once the window is open, applicants submit via the public form at `/apply`. The form collects:

- **Name** (required)
- **Phone number** (required — used for identity resolution and contacting winners)
- **Email** (optional)
- **Meeting place or address** (required — used to arrange cash handovers)
- **Payment preference** — bank transfer or cash
  - If bank: **sort code** (6 digits) and **account number** (8 digits) are required, and applicants can optionally upload a **proof of address** document at this stage to speed up verification later

After submitting, applicants see a confirmation page with their application reference number and outcome (accepted, flagged for review, or rejected with reason).

If the window is closed, the form displays a _window closed_ message and no application is submitted.

### Checking Application Status

Applicants can check their own progress at `/status` using the reference number shown on their confirmation page. The status page shows a timeline of their application, and if they were selected, the current state of their grant (e.g. awaiting POA review, payment pending). No login is required — the reference number is the only credential needed.

---

## 4. Reviewing Applications

### Viewing All Applications

Go to **Applications** to see all applications. You can filter by:
- **Month** — select the relevant month
- **Status** — e.g. accepted, flagged, rejected, selected
- **Payment preference** — bank or cash

### Application Statuses

| Status | Meaning |
|--------|---------|
| `accepted` | Eligible; in the lottery pool |
| `flagged` | Needs volunteer review (identity mismatch) |
| `rejected` | Ineligible (see reason) |
| `selected` | Won the lottery |
| `not_selected` | Did not win this month |

### Reviewing Flagged Applications

A flagged application means the phone number is already known but the name submitted does not match the existing record. This requires a volunteer to confirm or reject the identity.

1. Go to **Applications** and filter by status **flagged**
2. Click the application to open it
3. Review the submitted name vs. the existing name on record
4. **Confirm** — the application proceeds to eligibility check and, if eligible, enters the lottery pool
5. **Reject** — the application is rejected with reason _identity mismatch_

> The applicant is automatically notified that a volunteer will contact them when their application is flagged.

### Rejection Reasons

| Reason | Explanation |
|--------|-------------|
| `window_closed` | Application submitted outside the open window |
| `cooldown` | Applicant received a grant within the last 3 months |
| `duplicate` | Applicant already applied this month |
| `identity_mismatch` | Volunteer rejected the flagged identity review |

---

## 5. Closing the Lottery & Drawing Winners

### Closing the Application Window

When the application period ends:

1. Go to **Lottery**
2. Click **Close Application Window**
3. No new applications are accepted from this point

### Drawing the Lottery

After closing the window:

1. Go to **Lottery**
2. Click **Draw Lottery**
3. Enter:
   - **Fund balance** — the total available funds (in pence or £, as displayed)
   - **Reserve amount** — the amount to keep in reserve (not distributed)
   - **Grant amount** — default £40
4. The system calculates: `slots = floor((balance − reserve) ÷ grantAmount)`
5. Click **Draw** — winners are selected using an auditable, seeded random draw
6. Winners are ranked (rank 1 = first priority, rank 2 = first on waitlist, etc.)
7. Grants are automatically created for all selected winners

> **Auditable draw:** The RNG seed is deterministic and stored, so the draw can be verified independently.

> After the draw, all accepted applications are marked either `selected` or `not_selected`.

---

## 6. Grant Workflow — Bank Transfer

Applicants who chose **bank transfer** as their payment preference go through this workflow.

### Overview

```
Grant created (awaiting_review) → Volunteer verifies POA → Payment recorded → Complete
```

Bank details (sort code, account number, proof of address) are collected at application time. All bank grants start at `awaiting_review` and require a volunteer to verify the POA document before payment.

### Step 1: Assign Yourself to the Grant

1. Go to **Grants** and filter by the current month
2. Find an unassigned grant (bank transfer) in the **Awaiting Review** column
3. Click the grant
4. Click **Assign to me** — you are now responsible for this grant

### Step 2: Verify Proof of Address

1. Go to the grant
2. The grant panel shows the applicant's **sort code** and **account number** for reference
3. Click **View Document** to open the uploaded proof of address
4. Review the document:
   - **Approve** — POA passes due diligence; grant moves to `poa_approved`
   - **Reject** — POA fails; the grant stays in `awaiting_review`. Contact the applicant directly to collect corrected details, then update the bank details using **Edit Bank Details**

> If bank details need correcting, use the **Edit Bank Details** form in the grant panel to update the sort code and/or account number before re-approving.

> After **3 rejections**, the system automatically offers the applicant a cash alternative. See [Cash Alternative](#cash-alternative) below.

### Step 3: Record Payment

Once POA is approved, the grant panel shows the sort code and account number to use:

1. Make the £40 bank transfer to the applicant's account
2. Return to the grant
3. Click **Record Payment**
4. The grant is now **complete** (`paid`)

### Cash Alternative

If an applicant's POA is rejected 3 times, they are offered cash instead:

- If the applicant **accepts**: the grant moves to the cash handover workflow (see [Section 7](#7-grant-workflow--cash-handover))
- If the applicant **declines**: the slot is **released** and becomes available for the next person on the waitlist

---

## 7. Grant Workflow — Cash Handover

Applicants who chose **cash** as their payment preference, or who accepted a cash alternative after failed POA verification.

### Overview

```
Grant created → Assign volunteer → Arrange meeting → Hand over cash
→ Record payment → Submit expense reference → Complete
```

### Step 1: Assign Yourself to the Grant

1. Go to **Grants**
2. Find the cash grant (status: `awaiting_cash_handover`)
3. Click **Assign to me**

### Step 2: Arrange the Meeting

Contact the applicant using their phone number to arrange an in-person cash handover at the location they specified in their application.

### Step 3: Hand Over Cash & Record Payment

After handing over £40 in cash:

1. Go to the grant
2. Click **Record Payment**
3. The grant moves to `awaiting_reimbursement`

### Step 4: Submit Expense Reference

To complete the reimbursement audit trail:

1. Submit an expense claim through the fund's expense process
2. Once you have the expense reference number, return to the grant
3. Click **Record Reimbursement**
4. Enter the expense reference
5. The grant is now **complete** (`reimbursed`)

---

## 8. Handling Unresponsive Winners

If a winner does not respond after being notified:

| Timeline | Action |
|----------|--------|
| 7 days no response | Send a reminder; attempt to call if a phone number is on file |
| 14 days no response | Slot is held until month end |
| Month end | Manually release the slot |

### Releasing a Slot

1. Go to the grant
2. Click **Release Slot**
3. The slot is released and can be offered to the next person on the waitlist (ranked by lottery order)

> **Waitlist promotion** is not yet automated — releasing a slot requires contacting the next ranked applicant manually for now.

---

## 9. Managing Applicants

### Viewing Applicants

Go to **Applicants** to browse all known applicant profiles.

### Creating an Applicant Manually

If you need to add someone who cannot use the online form:

1. Go to **Applicants** → **New Applicant**
2. Enter their phone number, name, and optionally email
3. Save — the profile is created and can be referenced in future applications

### Editing an Applicant

1. Go to **Applicants** → click the applicant
2. Update their phone, name, or email
3. Save

### Viewing Applicant History

1. Go to **Applicants** → click the applicant → **History**
2. This shows all applications submitted by this applicant, including outcomes and grant results

### Deleting an Applicant

Deleting an applicant soft-deletes them from the system. Their event history is retained for audit purposes but they are removed from the active applicant list.

> **Data retention:** Applicant data is scheduled for auto-deletion after 6 months of inactivity, in line with the fund's data policy (not yet automated).

---

## 10. Key Rules Reference

| Rule | Detail |
|------|--------|
| **Grant amount** | £40 per grant |
| **Cooldown** | 3 months from the month of selection — e.g. selected in January → can reapply in April |
| **Duplicate applications** | One application per person per open window |
| **Application window** | Must be manually opened and closed each month |
| **Slot calculation** | `floor((fund balance − reserve) ÷ £40)` |
| **POA attempts** | Maximum 3 — after 3 rejections, cash is offered automatically |
| **Unresponsive winners** | Reminder at 7 days, slot held until month end (14+ days), then released manually |
| **Cash reimbursement** | Volunteers who pay cash must record an expense reference to complete the grant |
| **Waitlist** | Winners are ranked — lower-ranked selections serve as the waitlist if slots are released |

---

## Monthly Workflow Checklist

```
[ ] Open the application window (start of month)
[ ] Monitor flagged applications — review and confirm/reject identity
[ ] Close the application window (end of application period)
[ ] Enter fund balance, reserve, and grant amount
[ ] Draw the lottery
[ ] Assign yourself to grants
[ ] For bank grants: verify POA, record payment
[ ] For cash grants: arrange meeting, record payment, record reimbursement
[ ] Release slots for unresponsive winners after month end
[ ] Contact waitlisted applicants if slots are released
```
