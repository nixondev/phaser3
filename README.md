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
- **RoomStateManager:** A singleton managing all persistent game state (inventory, cured residents, unlocked doors, etc.).
- **MusicManager:** Singleton managing on-demand loading of MIDI tracks and SoundFonts, supporting parallel proximity layers and spatial effects.
- **SpessaSynthPlayer:** Modern MIDI synthesis engine wrapper using AudioWorklets for high-fidelity, low-latency audio.
- **AudioEffectsManager:** Handles environmental reverb (City, Indoor, Sewer, Hospital, Substation) using Web Audio ConvolverNodes.

For details on the audio directory structure and how to override assets, see the **Audio Workflow & Asset Structure** section in `CLAUDE.md`.

### Key Controls

| Key | Action |
|-----|--------|
| **Arrow keys / WASD** | Move |
| **E** | Interact / Use item / Dismiss dialog |
| **F** | Toggle Flashlight |
| **TAB** | Toggle inventory |
| **Q** | Drop selected inventory item |
| **ESC** | Pause menu |
| **- / +** | Adjust Volume (in Pause menu) |

### Debug & Editor

| Key | Action |
|-----|--------|
| **F1** | Toggle info HUD (FPS, room/player/cursor coords, tile GIDs, audio state) |
| **F2** | Toggle live room editor (paint, layer isolation, drag, resize) |
| **F3** | Toggle visual debug overlays (collision, doors, interactables, afflicted radii) |
| **L / U / C** | Reload room / unlock all doors / cure all afflicted (when F1 or F2 is on) |
| **R**, **&#91; / &#93;**, **- / +** | Cycle reverb / wet mix / master volume (when F1 or F2 is on) |
| **Shift + Click** | Teleport player to cursor (when F1 or F2 is on) |

In editor mode (F2): `1/2/3` switch active layer, `Q/E` cycle tile, left-click paints, right-click erases, middle-click eyedrops, **Shift+Arrow** expands the map by one tile on that edge (Ctrl+Shift+Arrow shrinks), drag-and-drop on an afflicted repositions them, and `X` saves the tilemap. See `CLAUDE.md` § Debug & Editor Systems for the full list.

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
- **Completed:** Combat system removal, core data model for cured residents, city map expansion with functional interiors, and basic entity state machines.
- **Audio:** Modern SoundFont-based synthesis (SpessaSynth) with atmospheric convolution reverb (data-driven per room from `rooms.json`) and dynamic vertical layering.
- **Tooling:** In-engine debug HUD, visual overlays, and a live room editor (F1/F2/F3) with disk-backed save endpoints in dev (see `CLAUDE.md` § Debug & Editor Systems).
- **Current Focus:** Implementing the cure mechanic and expanding environmental storytelling.

---

*This project is being developed as part of a larger exploration of atmospheric puzzle-based gameplay.*
