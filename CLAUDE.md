# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start dev server at http://localhost:3000
pnpm build      # Production build (TypeScript errors are ignored by config)
pnpm start      # Start production server
pnpm lint       # ESLint check
```

There are no tests in this project.

## Architecture

**Chasing Sachin** is a Next.js 16 (App Router) app that visualizes all 100 international centuries scored by Sachin Tendulkar on an interactive 3D globe.

### Data flow

All data is static — no backend or API. `public/centuries.json` contains 100 century records (fields: `n`, `date`, `year`, `format`, `score`, `notOut`, `opponent`, `ground`, `country`, `lat`, `lon`, `venueType`). The globe component reads this at runtime via `fetch('/centuries.json')`.

### Key files

- **`components/sachin-globe.tsx`** — the entire application UI (~850 lines). Contains the 3D globe (via `globe.gl`), all filter/timeline/autoplay logic, left stats panel, right detail panel, and a large `<style jsx>` block for component-scoped CSS. This is the only place state is managed.
- **`app/page.tsx`** — dynamically imports `SachinGlobe` with SSR disabled (required because globe.gl uses browser APIs).
- **`app/layout.tsx`** — root layout with Vercel Analytics and Google fonts.
- **`app/globals.css`** — Tailwind CSS 4 setup and OKLch CSS variable theming (dark mode only).

### Globe rendering

`globe.gl` wraps Three.js and renders into a canvas. The globe is centered on India (`lat: 20, lng: 75`). Century markers are colored by venue type: Home=gold (`#ffd166`), Away=teal (`#4ecdc4`), Neutral=gray (`#c9c9c9`). Marker size scales with score. Auto-rotation and user interaction (drag/scroll) are managed via globe.gl's built-in controls; user interaction pauses autoplay.

### Styling conventions

- Tailwind CSS 4 for layout; inline `<style jsx>` in `sachin-globe.tsx` for component-specific styles
- Mobile breakpoint at 640px with distinct panel layouts
- Path alias `@/*` maps to the repo root (configured in `tsconfig.json`)
- Shadcn/ui (New York style) + Radix UI for any generic UI primitives; add new shadcn components with `pnpm dlx shadcn@latest add <component>`

### Important config notes

- `next.config.mjs` sets `typescript.ignoreBuildErrors: true` and `images.unoptimized: true`
- No environment variables are required — the app is fully static

## Coding behavior

**Think before coding** — State assumptions explicitly. If a request is ambiguous (e.g. "add a filter" — which panel? which logic?), ask before writing code.

**Simplicity first** — Write minimal code that solves the stated problem. No speculative features, unnecessary abstractions, or extra error handling for things that can't fail.

**Surgical changes** — `sachin-globe.tsx` is intentionally monolithic; do not split or refactor it unless explicitly asked. When editing, touch only what the task requires. Don't improve adjacent code, reformat, or remove unrelated dead code — mention it instead.

**Goal-driven execution** — For multi-step tasks, define what "done" looks like before starting and verify each step before moving to the next.
