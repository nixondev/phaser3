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
npm run drums        # Build custom drum patches
npm run midi         # Generate custom MIDI files
```

## Architecture & Systems

### Scene Stack
`Boot` → `Preload` → `Menu` → `Game` (+ `UI` in parallel) → `[Pause overlay]`

- **GameScene:** Handles the main game loop, movement, AI, room transitions, and interaction logic.
- **UIScene:** Manages the HUD, inventory grid, dialog boxes, and interaction prompts.
- **RoomStateManager:** A singleton managing all persistent game state (inventory, cured residents, unlocked doors, etc.).
- **MusicManager:** Handles MIDI music and adaptive proximity-based audio layers.

For details on customizing audio instruments and samples, see the **Customizing Audio Assets** section in `CLAUDE.md`.

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

## Project Structure

- `src/scenes/`: Phaser scenes for different game states.
- `src/entities/`: Game objects including Player and Afflicted residents.
- `src/systems/`: Managers for input, rooms, state, and transitions.
- `src/data/`: Game data including `rooms.json` which defines the world.
- `public/assets/`: Tilemaps and sprites.

## Development Status

The project is currently in active development.
- **Completed:** Combat system removal, core data model for cured residents, city map expansion with functional interiors, and basic entity state machines.
- **Audio:** Custom WebAssembly MIDI synthesis with proximity-based volume layers for entities and environmental hints.
- **Current Focus:** Implementing the cure mechanic and expanding environmental storytelling.

---

*This project is being developed as part of a larger exploration of atmospheric puzzle-based gameplay.*
