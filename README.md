# SkyForge — Drone Builder & Flight Sim

Build a quadcopter part by part in a 3D workshop, pass the pre-flight check, then fly it.
Vite + TypeScript + Three.js, with a custom flight model (no physics engine).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Build mode
- **Drag** a part from the parts bin onto a glowing slot, or **click** it to auto-install.
- **Click** an installed part to inspect it. **Drag** it to move it, or drop it off the drone to remove it.
- Each motor is labelled ↻ CW / ↺ CCW. The prop on it must spin the same way, or the drone flips.
- Slide the battery to balance the centre of gravity (CoG).
- The checklist blocks flight on errors (missing parts, props too big, too heavy). Warnings still let you fly, and you see the consequences.

## Flight controls
| Key | Action |
|---|---|
| W / S | throttle (Manual) or climb rate (Alt/GPS hold) |
| A / D | yaw |
| Arrow keys | pitch / roll |
| Enter | arm / disarm |
| R | reset to pad |
| C | camera: chase → FPV (needs camera) → line-of-sight |
| 1 / 2 / 3 | Manual / Altitude hold / GPS hold (needs GPS) |
| Esc | back to workshop |

A gamepad works too (mode 2 layout). Fly through the green gate to start a lap.

## Code map
- `src/parts.ts`: parts catalog, 3D models, frame slot layout, thrust/power model
- `src/builder.ts`: workshop scene, drag/drop, snapping, selection
- `src/setup.ts`: pre-flight checks, mass/CoG/inertia, builds the flight config
- `src/sim.ts`: rigid-body physics, PID attitude controller, motor mixer, battery, collisions
- `src/world.ts`: flying field, obstacles, race gates
- `src/main.ts`: UI, mode switching, input, cameras, HUD
