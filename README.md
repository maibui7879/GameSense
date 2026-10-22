# GameSense Desktop

A local-first desktop gaming assistant for Windows.

## Core modules

- Collector: system and game data collection
- Game Core: adapter contracts and registry
- Analyzer: deterministic analysis and insights
- Advisor: contextual AI recommendations
- Database: local persistence
- Desktop: Electron + React + TypeScript

## Getting started

```bash
npm install
npm run dev
```

## Workspace layout

- `apps/desktop` — Electron + React + TypeScript desktop shell (`@gamesense/desktop`)
- `packages/contracts` — shared types and IPC contracts
- `packages/game-core` — adapter contracts and registry
- `packages/collector` — system and game data collection
- `packages/analyzer` — deterministic analysis
- `packages/advisor` — contextual AI recommendations
- `packages/database` — SQLite + Drizzle ORM persistence
