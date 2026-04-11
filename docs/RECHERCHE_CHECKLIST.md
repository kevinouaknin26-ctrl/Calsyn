# CALLIO V2 — Checklist Phase Recherche

**Date :** 2026-04-10 19:50
**Regle :** Etudier TOUT avant d'ecrire du code. Chaque sujet = recherche + notes + decision.

---

## VoIP & Telephonie
- [x] R01 — Twilio Voice SDK browser (init, connect, events, lifecycle)
- [x] R02 — Telnyx WebRTC SDK (init, newCall, events, lifecycle)
- [x] R03 — Power Dialer patterns (kaiquelupo repos, conference bridge)
- [x] R04 — Parallel Dialing (batch, bridge premier humain, cancel les autres)
- [x] R05 — Twilio webhook signature validation (X-Twilio-Signature)
- [x] R06 — Telnyx TeXML (equivalent TwiML, differences, compatibilite)
- [x] R07 — AMD Answering Machine Detection (async pattern, Twilio + Telnyx)
- [x] R08 — Call recording (legal France, stockage, formats, duree retention)
- [x] R09 — Conference/bridge pour coaching/whispering (Twilio + Telnyx)
- [x] R10 — WebRTC qualite audio (MOS score, jitter, packet loss monitoring)
- [x] R11 — Abstraction multi-provider (interface commune Twilio/Telnyx)

## Backend & Data
- [x] R12 — Supabase Edge Functions best practices (Deno, cold starts, limites)
- [x] R13 — Supabase RLS patterns stricts (multi-tenant, security definer)
- [x] R14 — Supabase Realtime (subscriptions, channels, usage pour live updates)
- [x] R15 — Postgres RPC functions (transactions atomiques, credit lock)
- [x] R16 — Queue pattern pour jobs async (analysis_jobs, triggers DB vs cron)

## IA & Analyse
- [x] R17 — Marche transcription complet (Deepgram, AssemblyAI, Gladia, Whisper, Rev.ai, Speechmatics, Soniox + self-hosted)
- [x] R18 — Marche analyse d'appels complet (Gong, Symbl.ai, Claude, GPT, Modjo, open source)
- [x] R19 — Pipeline async transcription → analyse (queue pattern, retry, abstractions)

## Frontend & UX
- [x] R20 — XState v5 state machine (call lifecycle, nested states, invoke)
- [x] R21 — TanStack Query v5 (queries, mutations, cache, optimistic updates)
- [x] R22 — React patterns temps reel (TanStack Virtual, React.memo, timer isolé, XState)
- [x] R23 — Design system (Tailwind + shadcn/ui + Radix, dark mode first, Minari layout)
- [x] R24 — Raccourcis clavier (react-hotkeys-hook, 15+ shortcuts, guide via ?)

## Infra & Monitoring
- [x] R25 — Sentry React + Edge Functions (setup, tags org_id+call_sid)
- [x] R26 — Zod validation (schemas webhooks, Claude response, disposition, env vars)
- [x] R27 — Vite + React + TypeScript setup (aliases, structure)

## Securite
- [x] R28 — Zero Trust Edge Functions (JWT + signature Twilio + rate limiting Upstash)
- [x] R29 — RGPD (MVP sans annonce, architecture RGPD prête mais désactivée)

## Business
- [x] R30 — Pricing (49/99/199€, 1000 min incluses, coût réel ~$0.06/appel)
- [x] R31 — Concurrence (Nooks/Orum $5K/an, Aircall $70+, notre créneau = PME FR 49-99€)

---

**Progression : 31/31 terminés — PHASE RECHERCHE COMPLETE**
