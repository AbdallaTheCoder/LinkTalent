# TalentLink

TalentLink is a skills-first talent marketplace connecting skilled refugees and host-community professionals across Kenya and East Africa to verified credentials, bridging pathways, compliant work readiness, industry mentorship, and paid opportunities.

## What TalentLink Does

TalentLink brings three groups together in a zero-login, shared platform designed for immediate onboarding and live end-to-end workflows:

* **Talent:** Professionals and emerging talent create profiles showcasing their cohort, bridging pathways (such as NITA Recognition of Prior Learning, EPRA T2, Microsoft AZ-900, and Power Learn Project), work-authorization readiness, KES bank/M-Pesa payout readiness, portfolio links, and verification-badged skills.
* **Employers & Institutional Partners:** Private employers, social enterprises, agencies, and NGOs publish opportunities with explicit deliverables, practical screening criteria, payout channels, and work-authorization rules, then review ranked applicants and confirm placement outcomes.
* **Mentors & Credential Verifiers:** Industry practitioners share their expertise, weekly availability, and active mentee capacity so talent can request guidance, get skills endorsed, and have portfolio or bridging evidence verified.

## Core Platform Capabilities

### 1. Credential & Bridging Verification Desk
Candidates without traditional diplomas or accessible home-country paperwork can submit project portfolios, work samples, Recognition of Prior Learning (RPL) logs, or bridging credentials (`project_portfolio`, `bridging_credential`, `rpl_assessment`, `work_sample`). Accredited mentors and verifiers audit submissions in real time, updating status (`submitted`, `under_review`, `verified`, `rejected`) with audit notes and upgrading candidate skills from `Self-Reported` to `Portfolio Backed`, `Mentor Endorsed`, or `Credential Verified`.

### 2. Access, Work-Authorization & Payout Readiness
Talent and employer workflows address onboarding and compliance bottlenecks up front while protecting personal privacy:
* **Work-Authorization & Eligibility Readiness:** Captures structured readiness states (`Refugee ID / Work Permit Ready`, `Kenyan National ID Ready`, `EAC Citizen Work Eligible`, `Remote Independent Contractor Eligible`, or `Work-Auth Onboarding Support Needed`) without exposing raw national or refugee ID numbers.
* **Financial & Payout Readiness:** Tracks KES Bank Transfer, M-Pesa mobile money, and international remote payout readiness alongside employer payout channels.
* **Kenya ODPC Data Privacy Consent:** Captures explicit data-processing consent on talent registration.

### 3. Opportunity Marketplace & Practical Screening
Employers publish opportunities across five categories (**Employment**, **Internship**, **Fellowship**, **Apprenticeship**, and **Remote Work**) with compensation in Kenya Shillings (KES), expected deliverables, and practical screening criteria.

### 4. Explainable Match & Readiness Scoring
Every application and role recommendation is scored from 0% to 100% across four weighted dimensions, complete with a transparent factor breakdown and missing-skill summary:

| Criterion | Weight | How It Works |
| :--- | :---: | :--- |
| **Skills & Proficiency** | **50%** | Evaluates candidate skills against required and optional role skills, weighted by proficiency (`beginner` to `expert`) and verification source. |
| **Experience & Sector Fit** | **20%** | Compares candidate sector alignment and years of experience against the role's sector and minimum experience requirement. |
| **Verification & Bridging** | **15%** | Rewards verified portfolio items, work samples, and certified bridging pathways. |
| **Work-Auth & Payout Fit** | **15%** | Evaluates work-authorization readiness, payout readiness, and remote/hybrid/onsite arrangement alignment. |

### 5. Mentorship Hub with Capacity Guardrails
Talent can send mentorship requests with targeted goals, while mentors manage active mentee slots (`active / max_mentees`) so capacity limits are respected automatically.

### 6. Real-Time Pipeline & SDG Impact Measurement
Employers advance candidates across hiring stages (`submitted`, `under_review`, `shortlisted`, `interview`, `accepted`, `rejected`) and confirm placement outcomes. Live metrics map directly to **UN Sustainable Development Goals 4, 8, 10, 16, and 17**.

## Repository & Database Structure

* `index.html` — Single-page application interface covering Opportunities, Talent & Readiness Pool, Credential Verification Desk, Mentors, Hiring Pipeline, and SDG Impact Dashboard.
* `styles.css` — Responsive design system with verification badges, readiness strips, match factor grids, and accessible modals.
* `config.js` — Supabase client configuration with automatic detection for live backend or local fallback mode.
* `app.js` — Client-side state management, explainable match engine, verification/endorsement workflows, and live Supabase/local persistence.
* `schema.sql` — PostgreSQL schema, enum types, indexes, `get_public_impact_metrics()` RPC, `updated_at` triggers, and showcase RLS policies (with production hardening blueprint).
* `seed.sql` — Pre-populated East African talent cohorts, partner organisations, opportunities, mentors, verification items, applications, and confirmed outcomes.

## Quick Setup (Supabase + Static Hosting)

1. In your Supabase **SQL Editor**, run `schema.sql` first to create all tables, functions, and policies.
2. Run `seed.sql` second to populate the initial skills taxonomy, partner organisations, talent profiles, opportunities, mentors, and metrics.
3. Serve `index.html`, `styles.css`, `config.js`, and `app.js` on any static host (such as Netlify, Vercel, or GitHub Pages). If Supabase is unreachable, the app automatically runs in interactive local demo mode using `localStorage`.

## Project Status

This release is an active **Minimum Viable Product (MVP)** built to validate skills-first verification, compliance readiness, explainable role matching, mentorship capacity management, and real-time outcome tracking.

## Author & Contact

* **Creator:** Abdullahi Abdi Mohamed
* **Location:** Dagahaley-Dadaab, Kenya
* **Email:** bin.abdallah.jr@gmail.com
* **GitHub:** [dev-binabdallah](https://github.com/dev-binabdallah)

## Proprietary Notice

All rights reserved. The TalentLink platform, its source code, design, and documentation are proprietary to Abdullahi Abdi Mohamed and may not be copied, modified, distributed, or used to build or deploy derivative services without explicit written permission.
