# WARDEN

A 2D top-down exploration/puzzle game built with TypeScript and Phaser 3.

## Project Overview

The player wakes alone in a sealed city, discovers the afflicted residents can be cured, and repopulates the city to find a way out.

- **Genre:** 2D Top-down Exploration / Puzzle
- **Aesthetic:** Retro pixel-art (320×240 resolution, 3× zoom)
- **Combat:** None. Focus is on interaction, cure mechanics, and exploration.
- **Tone:** Eerie and atmospheric, focusing on environmental storytelling.

## Tech Stack

- **Game Engine:** [Phaser 3](https://phaser.io/) (v3.80.1)
- **Language:** TypeScript 5.4
- **Build Tool:** Vite 5.4
- **Assets:** Tiled JSON tilemaps, PNG spritesheets (16×16 tiles)

## Getting Started

### Prerequisites

- Node.js (version 18+ recommended)
- npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate placeholder assets (required for initial run):
   ```bash
   npm run setup
   ```

### Development Commands

```bash
npm run dev          # Start Vite dev server with HMR at localhost:8080
npm run build        # Build for production (outputs to /dist)
npm run preview      # Serve the production build locally
npm run setup        # Full asset setup (generate maps + build tileset)
npm run build-tiles  # Compose individual PNGs into tileset.png
```

## Architecture & Systems

### Scene Stack
`Boot` → `Preload` → `Menu` → `Game` (+ `UI` in parallel) → `[Pause overlay]`

- **GameScene:** Handles the main game loop, movement, AI, room transitions, and interaction logic.
- **UIScene:** Manages the HUD, inventory grid, dialog boxes, and interaction prompts.
- **RoomStateManager:** A singleton managing all persistent game state (per-character inventories, character roster, active character, cured/recovered residents, unlocked doors, dropped items, visited rooms, etc.).
- **MusicManager:** Singleton managing on-demand loading of MIDI tracks and SoundFonts, supporting parallel proximity layers and spatial effects.
- **SpessaSynthPlayer:** Modern MIDI synthesis engine wrapper using AudioWorklets for high-fidelity, low-latency audio.
- **AudioEffectsManager:** Handles environmental reverb (City, Indoor, Sewer, Hospital, Substation) using Web Audio ConvolverNodes.

For details on the audio directory structure and how to override assets, see the **Audio Workflow & Asset Structure** section in `CLAUDE.md`.

### Key Controls

| Key | Action |
|-----|--------|
| **Arrow keys / WASD** | Move |
| **E** | Interact / Use item / Advance dialog |
| **F** | Toggle Flashlight |
| **TAB** | Toggle inventory |
| **Q** | Drop selected inventory item |
| **1 / 2 / 3 / 4** | Switch active character (roster slots) |
| **ESC** | Pause menu |
| **- / +** | Adjust Volume (in Pause menu) |

### Debug & Editor

| Key | Action |
|-----|--------|
| **F1** | Toggle info HUD (FPS, room/player/cursor coords, tile GIDs, audio state) |
| **#** | Open standalone tile atlas / painter editor |
| **?** | Open main room/object editor scene |
| **F1 / F3** | Toggle info HUD / visual debug overlays (in Game mode) |
| **R**, **&#91; / &#93;**, **- / +** | Cycle reverb / wet mix / master volume (when F1 or F2 is on) |
| **Shift + Click** | Teleport player to cursor (when F1 or F2 is on) |

The editor (?) features Select mode (M) for safe inspection and dragging, Color mode (K) for persistent solid colors, and Actual view (hold G) for in-game preview. 1-6 switch layers, Q/E cycle tile, and X saves objects + tilemap. See EDITORGUIDE.md for full details.

## Project Structure

- `src/scenes/`: Phaser scenes for different game states.
- `src/entities/`: Game objects including Player and Afflicted residents.
- `src/systems/`: Managers for input, rooms, state, and transitions.
- `src/data/`: Game data including `rooms.json` which defines the world.
- `public/assets/`: Tilemaps and sprites.

## Working on the game

- `EDITORGUIDE.md` — short how-tos for using the in-game editor (start here if you're new).
- `CLAUDE.md` — design intent and architecture reference.
- `PARADIGM.md` — design grammar; what puzzle patterns the engine supports.
- `ROADMAP.md` — build sequence; what's shipped, what to build next.
- `AUTHORING.md` — practical recipes for the in-game editor.

## Development Status

The project is currently in active development.

- **Core loop:** Room transitions, collision, tilemaps, inventory (12-slot per character), afflicted state machine (wander → agitate → frighten → cure → recover).
- **Cure flow:** Auto-cure on collision, inventory-use cure, cure clue dialog, home-room teleport for cured residents, multi-page backstory conversations, two-item handover on recovery. Curing a resident automatically unlocks the door to their home room.
- **Character roster:** Recovered residents join a playable roster. Switch via `1`/`2`/`3`/`4` or the avatar bar (bottom-left HUD). Per-character inventories; cross-room switches fade-transition. Inactive roster members appear as parked body sprites at their last position.
- **Death:** Any character death triggers a full game reset — all state wiped, protagonist restarts from scratch.
- **Authored characters:** Kai (Former Lab Technician, house-b) and Maren (Local Shopkeeper, house-c) — each with a 3-page backstory and two recoverable items.
- **Audio:** Modern SoundFont-based synthesis (SpessaSynth) with atmospheric convolution reverb (data-driven per room from `rooms.json`) and proximity-based layering.
- **Tooling:** Standalone Tile Editor (#) and Room Editor (?) with Select mode, Color tiles, Actual view, Smart Save, floor/wall painting, and object dragging.
- **Current Focus:** Phase 1 (unified interaction resolver) and building the first full puzzle chain as data.

---

*This project is being developed as part of a larger exploration of atmospheric puzzle-based gameplay.*
