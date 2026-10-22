# Game Adapter Guide

Each game adapter must implement the shared game-core contracts.

Adapters must declare their supported capabilities, validate incoming
data, preserve timestamps and provenance, and handle unavailable data
explicitly.

Do not assume that every game exposes gameplay events.
