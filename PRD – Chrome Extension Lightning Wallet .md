PRD – Chrome Extension Lightning Wallet (Single User) - Proton Pay
1. Objective

Build a minimal Chrome extension wallet for Bitcoin Lightning payments using the Voltage Payments API (v1).
The wallet will be single-user only and run locally (not published yet).

2. Features
2.1 Authentication / Login

User logs in with email + password.

Credentials are verified against a local backend (mock or staging service).

On success → show wallet dashboard.

On failure → display error message.

2.2 Dashboard

Show:

Balance → via Voltage GET /wallets/{walletId}

Transaction history → via Voltage GET /payments/{paymentId}/history

Actions:

Send payment (input invoice, submit, poll status).

Receive payment (enter amount + desc, generate invoice, poll status).

2.3 Send Payment Flow

User enters Lightning invoice.

Call Voltage:

POST /organizations/{orgId}/environments/{envId}/payments


Poll:

GET /payments/{paymentId}


Show status: sending → completed/failed.

2.4 Receive Payment Flow

User enters amount + description.

Call Voltage:

POST /organizations/{orgId}/environments/{envId}/payments


Get payment_request invoice.

Display invoice + QR code.

Poll GET /payments/{paymentId} until completed/failed.

2.5 Account Section

Allow editing:

Name

Email

Password

Option to delete account → wipes local data (and backend if supported).

3. Technical Design
3.1 Chrome Extension Structure

manifest.json (MV3).

Background service worker → API calls, session mgmt.

Popup UI (React or vanilla).

Options page → account management.

3.2 Local Backend

Handles:

User auth (email/password).

Stores Voltage wallet IDs + org/env IDs.

Extension talks to backend, not directly to Voltage.

3.3 API Integration Summary
Feature	Endpoint
Balance	GET /wallets/{walletId}
Transaction history	GET /payments/{paymentId}/history
Send payment	POST /payments + poll GET /payments/{paymentId}
Receive payment	POST /payments + fetch invoice + poll GET /payments/{paymentId}
4. User Flows
4.1 Login

Open extension → login form.

Enter email/password.

Backend validates.

Success → dashboard.

Failure → error message.

4.2 Dashboard

Show balance + history.

Send: enter invoice → send via API → poll → show result.

Receive: enter amount → create invoice → display invoice → poll until paid.

4.3 Account

Edit name/email/password.

Delete account = wipe data.

5. Scope
In-Scope (MVP)

Single-user login.

Balance + history display.

Send + receive payments.

Basic account section (edit + delete).

Local hosting only.

Out of Scope (Future)

Multi-user support.

Real-time webhooks.

Multi-wallet.

Chrome Web Store publishing.

6. Non-Functional Requirements

Security: Store secrets safely in chrome.storage.local.

Usability: Minimal, clean UI.

Reliability: Poll payments until resolved.

Performance: UI must remain responsive.

7. Milestones

Extension scaffold + backend mock.

Login flow.

Balance + txn history.

Send payment.

Receive payment.

Account section.

Testing & polish.

Local deployment via chrome://extensions.

8. Docs
https://voltageapi.com/v1/docs