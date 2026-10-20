---
name: workout-pwa
description: "Larry's personal fitness tracker PWA — location, stack, and the YouTube embedding constraint"
metadata: 
  node_type: memory
  type: project
  originSessionId: e547a7b4-3176-4071-87f9-42b4ec69ffcc
  modified: 2026-08-05T11:11:47.354Z
---

Personal fitness-tracker PWA built for Larry at `/Users/tharlinhtet/my/workout-pwa`.
Next.js 14 (App Router) + TypeScript + Tailwind, fully client-side, data in `localStorage`,
hand-written service worker, generated black/white dumbbell PNG icons. Deploy target = Vercel,
install on iPhone via Add to Home Screen. Apple-clean black & white design.

Trainer's plan + video links live in `data/program.ts` (source: `Linn-Htet-Sheet1.pdf`).
Days map Monday=1 … Sunday=7; Day 3 and Day 7 are Rest.

**Non-obvious gotcha (RESOLVED):** the trainer's YouTube videos (channel "Fit4Life") DO
embed and play inline — verified on the live Vercel HTTPS site. Earlier "Error 153 / Video
unavailable" was a **localhost** quirk (YouTube embeds are flaky on http://localhost), NOT a
real embedding block. Use the standard `https://www.youtube.com/embed/ID` domain (the
`youtube-nocookie` domain was stricter and failed). Lesson: test YouTube embeds on the real
HTTPS deploy, never trust localhost. Current UX: tap thumbnail → inline iframe autoplays.

Live URL: https://workout-pwa-five.vercel.app (GitHub: Linn-Htet123/workout-pwa, auto-deploys on push).

Rest timer has Start / Pause / Stop and computes from an end-timestamp so it survives screen lock.

**AI calorie estimator** (added): `/meal` screen — snap 3+ meal photos + optional note → Claude vision
estimates calories with per-item breakdown. Model = `claude-sonnet-5` (Larry chose "balanced"), effort low.
Server route `app/api/estimate-meal/route.ts` holds the key server-side (never in browser) — needs
`ANTHROPIC_API_KEY` set in Vercel env vars (and `.env.local` for local). Bilingual EN/Burmese. It's Larry's
own personal Anthropic key, billed per use (~a few cents/estimate). Client resizes photos to 1024px first.
App is now bilingual (EN/Burmese, default Burmese) via `components/LangProvider.tsx` + `data/i18n.ts`.
