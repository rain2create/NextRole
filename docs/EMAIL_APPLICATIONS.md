# Email applications and tracking integration

Open `/app/email`. Select a stored job and resume, enter recipient, subject and body, save the draft, review it, and explicitly confirm sending. No email is sent on draft creation.

Configure `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 TLS), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` in `.env.local`, then restart. Use your provider's app password when required. Credentials remain server-side. Test with your own recipient first. SMTP acceptance is not proof of inbox delivery or reading; bounce processing is not implemented.

## Shared result pipeline

Both browser and email applications persist `ApplicationRun` via `saveRun`. No separate tracking ingestion endpoint is needed.

- `awaiting_approval`: browser form prepared or email draft prepared. Syncs to tracking `saved`, applied count remains zero.
- `submitted`: browser agent reports success, or SMTP accepts the email. Syncs to `applied`.
- Other statuses do not create an applied record. An existing prepared record remains `saved`; inspect linked runs for failure/cancellation details.
- Deduplication: same run and transition label are processed once. A prepared run can subsequently transition to submitted without duplicate records. Existing interview/offer progress is preserved.

Use `GET /api/tracking` for the existing summary, `GET /api/tracking/{id}` for the record and full linked runs (including channel and email delivery details), and `POST /api/tracking/sync` to reconcile persisted runs. `GET /api/applications` provides all runs. Tracking merges by job ID under the current single-profile design.

Email routes: `GET /api/email` returns available jobs, resumes, email runs and configuration status; `POST /api/email` creates a draft from `{jobId,resumeVersionId,to,subject,body}`; `POST /api/email/{id}` with `{confirm:true}` sends that exact stored draft and selected attachment. Sent drafts cannot be sent again. Uncertain delivery disables automatic retries; check the mailbox before preparing another draft. In-process send requests are serialized per draft; this local app is not designed for multiple server instances.

Tracking UI continues to label both merely saved and prepared records as 待投递. Distinguishing them in the summary UI requires examining linked run status or a future UI enhancement. Actual SMTP credentials and external delivery must be tested by the user; automated tests do not send external email.

## Recruiting-source preparation

`POST /api/email/prepare` accepts multipart fields: `text` (including public URLs), legacy `url`, optional `file` (PNG/JPEG/WebP/PDF/DOCX, maximum 8 MB; legacy `image` is also accepted), optional confirmed `recipient`, and required `resumeVersionId`. At least one source is required. Source extraction uses the agent model with thinking disabled; generation uses the text model and extracts facts from the selected attachment, not the global profile. The result is `{draft, source, warnings}`. Preparation creates a job record but does not save a draft run or send email. The user reviews editable recipient, subject and body, then saves the draft and separately confirms sending. Missing required application facts are returned as warnings/questions.

Source text and images are untrusted. Generated recipient and claims require human verification. Public URL fetches validate each redirect against private-network targets; dynamically loaded or login-only pages should be supplied as screenshot/text instead. Multiple recipients are intentionally unsupported. Original source upload is not retained. SMTP and tracking behavior are unchanged.

## Embedded workspace and mailbox connection

The main `/app` workspace includes an email panel at `#email-applications`; `/app/email` remains available as a standalone view. Source input has one text/URL box (up to three public URLs) and one file selector for PNG/JPEG/WebP/PDF/DOCX (8 MB). PDFs must contain readable text; use a screenshot for scanned documents.

The mailbox panel uses `GET /api/email/settings` for non-secret configuration and `POST /api/email/settings` with `{host,port,user,pass,from}` to verify the SMTP connection and save locally. The password is never returned. Credentials are stored in ignored `data/mail-settings.json` with owner-only permissions, not encrypted; do not share this file. Saved UI settings take priority over legacy `.env.local` SMTP settings. Connecting does not send a test message. The UI supports 163's SMTP app password or custom SMTP on TLS port 465/STARTTLS port 587; OAuth-only mailboxes need a future integration.

After preparing the message, save its draft. The draft card exposes Confirm and send email when a mailbox is configured. It sends only after explicit user confirmation. SMTP acceptance triggers the same submitted-to-applied synchronization; a delivery error remains unconfirmed and automatic resend is blocked.

## Mailbox compatibility scope

The transport supports SMTP username/app-password authentication over TLS port 465 or STARTTLS port 587; it is not restricted to NetEase. 163 is user-tested; QQ, 126, Gmail app passwords and other enterprise SMTP configurations require account-specific validation. OAuth-only Outlook/Microsoft 365/HKUST mailboxes and chat mailbox plugins are not implemented. See the main README for per-provider instructions and official references. No ordinary school/Microsoft password should be entered as a substitute for OAuth.
