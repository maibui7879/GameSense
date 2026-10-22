# Architecture

The application uses a modular monorepo.

- Electron main process owns desktop lifecycle and IPC.
- Preload exposes a restricted API to the renderer.
- React renderer owns presentation and user interaction.
- Domain packages contain collection, analysis and advisor logic.
- SQLite provides local persistence.
- External AI providers are optional.

## Process boundaries

```
Renderer (React)
    │  window.api (typed, exposed via preload)
    ▼
Preload (contextBridge)
    │  ipcRenderer.invoke / ipcRenderer.on
    ▼
Main (Electron)
    │  domain package calls
    ▼
Domain packages (collector / analyzer / advisor / database)
```

## Design principles

- Domain packages are plain TypeScript modules with no Electron imports.
  They are testable in isolation with Vitest.
- IPC is the only bridge between renderer and main. Every channel is
  declared once in `packages/contracts` and typed on both sides.
- The renderer never touches Node APIs directly; it only sees the narrow
  surface exposed by the preload script.
- Data flows one way: collector produces raw events, analyzer derives
  insights, advisor turns insights into recommendations.

## Phase status

Phase 1 (desktop foundation) is scaffolded. Session lifecycle, collection,
analysis, game adapters and the AI advisor are planned for later phases.
