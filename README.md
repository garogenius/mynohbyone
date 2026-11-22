# Nohby ONE Desktop & Dashboard

Tauri 2 + React + TypeScript + Tailwind CSS desktop application for **Nohby ONE** (Nohby Technologies Limited).

## Architecture
- **Local-First Execution:** Rust (`src-tauri/`) hosts native desktop capabilities; React + Zustand connects to the Nohby ONE FastAPI backend (`/api/v1`).
- **Implemented Phases:**
  - **Phase 0:** Tauri 2 + React + Tailwind v4 shell, obsidian design system, typed `/api/v1` client with automatic 401 refresh-token rotation, launch/offline/loading/error states.
  - **Phase 1:** Registration, Login, Forgot Password, Device Registration Onboarding, Devices Management (heartbeat, rename, revoke), and Account Profile Settings.

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

## Build & Test

```bash
npm run build
npm test
```
