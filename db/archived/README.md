# Archived Database Scripts

This folder contains one-time migration scripts that have already been executed in production.
These are kept for reference but should NOT be run again.

## Archived Files

| File | Description | Status |
|------|-------------|--------|
| `schema-complete.sql` | Consolidated schema snapshot from Dec 2024 | Superseded by `../schema.sql` |
| `setup-database.mjs` | Initial database setup script | Executed |
| `migrate-to-clerk-orgs.mjs` | Migration to Clerk organizations | Executed |
| `run-clerk-migration.mjs` | Clerk migration runner | Executed |
| `run-organizations-migration.mjs` | Organizations migration runner | Executed |
| `run-context-migration.mjs` | Context migration runner | Executed |
| `add-org-columns.mjs` | Add organization columns | Executed |
| `migrate-gallery-base64-to-blob.mjs` | Migrate gallery images to Vercel Blob | Executed |

## Current Structure

Active database files are in the parent `db/` folder:
- `schema.sql` - Main authoritative schema
- `migrate.mjs` - Generic migration runner
- `run-migration.mjs` - Migration execution script
- `rls-policies.sql` - Row Level Security policies
- `migrations/` - Incremental SQL migrations (001-005)
