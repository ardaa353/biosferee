# BioSfere database migration

Target: **TiDB Cloud Starter, MySQL-compatible**, spending limit **0**, no payment card.
This is a recurring free quota, not a trial. Current published limits are 5 GiB row storage,
5 GiB columnar storage and 50 million request units/month. Quota exhaustion can restrict
access; a free hosted plan is not an unlimited or permanent availability guarantee.

Official references:
- https://docs.pingcap.com/tidbcloud/select-cluster-tier/
- https://docs.pingcap.com/tidbcloud/create-tidb-cluster-serverless/
- https://aiven.io/docs/platform/concepts/service_backups

## Current decision: fresh start

The owner authorized a fresh, empty TiDB-backed application on 23 November 2026 instead
of waiting for the inaccessible Aiven data. Keep the old service and its backups intact.
This decision authorizes a blank-site cutover after schema and connection verification.

Created all 14 application tables from `db/schema.ts` using the checked-in initial
Drizzle migration. Live SQL verification returned 96 columns, all 7 secondary indexes,
and zero users/posts/sessions. The migration ledger records the initial migration hash.
New numeric IDs start at 1,000,000,000 so ordinary old low-ID links do not silently point
to unrelated new content. Existing users will need new accounts in this fresh database.

Public registration always creates ordinary users, including when the database is empty.
Do not give the first anonymous registrant administrator privileges. Establish the owner's
administrator role separately after verifying their new account through the authenticated
owner setup workflow; no bootstrap account or default password has been seeded.

The owner completed TiDB's password-reset step manually. The connection string was
transferred into Render's secret `DATABASE_URL` without being printed, committed, or
placed in frontend configuration. The stored target was read back privately and checked
before deployment. Keep all existing Cloudinary variables.

Fresh-start cutover is live. Render starts with `npm start`, without `db:push` on every
startup. Verified `/api/health/database` returns 200/ok, the public post list returns an
empty array, and an old absent post returns 404/NOT_FOUND instead of a database error.
The signup page renders correctly. A nonexistent-account login is checked separately
from a successful real-account registration; do not claim old accounts were recovered.
TiDB connections require TLS with certificate-chain and hostname verification.

If old data becomes available later, use a reviewed merge into the live fresh database,
with duplicate-email/user mappings and post-reference checks. The full-copy script below
requires an empty target and MUST NOT be used to overwrite or clear the active site.

## Original all-data migration: source access prerequisite

On 23 November 2026 the existing Aiven MySQL service was powered off after its platform
trial expired. Render's read-only database probe returned `ENOTFOUND`. Aiven lists full
backups, but does not offer direct downloads of its encrypted backups. A running source
or a complete SQL dump is required before an all-data migration can be verified. A fresh
start does not recover these old records. Do not reconstruct accounts from public
observations or start paid service usage without the owner's approval.

## Original full-copy workflow (requires a separate empty target)

1. Create a MySQL-compatible Starter instance in the owner's TiDB account; verify that
   spending limit is 0. Create a dedicated empty `biosfere` database.
2. Obtain read access to the original Aiven database or an independently verified full SQL
   export. A source private CA must be supplied when required. Do not disable certificate
   verification. Stop all source application/background writes for the final copy.
3. Supply sourceUrl, targetUrl, optional sourceCa/targetCa and sourceWritesPaused through
   stdin to `node scripts/migrate-database.mjs --plan`, then `--copy`. Never put connection
   secrets into shell arguments, commits, logs or browser-visible frontend variables.
4. The tool reads the source in a read-only consistent snapshot, requires an empty target,
   copies original DDL, all columns and all tables, preserves original IDs, password hashes,
   sessions, moderation data and preferences, and streams rows in bounded batches. Views,
   routines, triggers, events and ignored schema clauses stop the transfer for review.
5. Every table must pass row-count and order-independent SHA-256 row fingerprint checks.
   JSON values are canonicalized; binary data, dates and large integer strings are retained.
   Failed/partial targets are never selected automatically and are not automatically deleted.
6. Only after verification, replace DATABASE_URL in Render, keep Cloudinary configuration,
   and deploy. The app enables verified TLS for TiDB automatically. DATABASE_CA_CERT is
   available for providers using a private CA. Verify database health, anonymous post links,
   sign-in, roles and a reversible authenticated operation before reopening source writes.
7. Retain the source/backup for rollback; do not delete the old service as part of cutover.

Photos/videos remain in the existing Cloudinary account. The exact database URLs pointing
to those files move with their records; copying or re-uploading media is unnecessary.

## Preparation status (23 November 2026)

- Signed in to the owner's existing TiDB organization. Its existing `biosfere-db`
  Starter instance is active, MySQL-compatible, and displays Current Spend: Free.
  No payment card was added and no paid upgrade was submitted.
- A read-only information-schema query confirmed that no application tables existed.
  Created the dedicated, empty `biosfere` database using utf8mb4; no existing table
  or record was overwritten.
- Submitted a support request from the owner's signed-in Aiven account for no-charge
  read-only export access or a complete logical SQL export. It explicitly forbids paid
  activation, charges, and deletion, and requests preservation of the service/backups.
  Awaiting a human response; the documentation assistant confirmed there is no
  self-service free export path while the source is powered off.
- No old rows have been transferred. The owner chose the fresh-start procedure above;
  the initialized TiDB schema is now connected to the live Render service. This is a
  working empty site, not recovery of the old Aiven data. The owner still needs a new
  application account, followed by verified, explicit administrator assignment.

## Request sent to Aiven support

Our trial MySQL service is powered off. We need to move our existing application data
to another provider. Could you provide temporary **read-only export access at no charge**,
or another no-charge way to obtain a complete logical SQL export, including all tables?
Please do not activate a paid plan or incur charges. We can identify the project/service
privately in the support conversation. We need the existing data, not a new empty service.
