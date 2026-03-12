---
name: building-hyperfy-apps
description: >
  Build 3D apps for Hyperfy virtual worlds. Use when asked to create prims,
  physics, multiplayer sync, UI, or fix issues like "players fall through"
  or "objects underground".
---

# Building Hyperfy Apps

Create interactive 3D apps for Hyperfy virtual worlds.

## When NOT to Use This Skill

- Non-Hyperfy JavaScript projects
- Modifying server infrastructure (not app scripts)
- Working with files outside `world/` or `examples/`

---

## Classify the Request First

**Problem-First** (diagnose before building):
- "Players fall through the floor"
- "Multiplayer desyncs"
- "Objects appear underground"
- "Late joiners see wrong state"
→ Check references/common-mistakes.md, then fix

**Tool-First** (apply patterns directly):
- "Add a prim"
- "Create a trigger zone"
- "Set up networking"
→ Use decision trees and checklists below

---

## Rationalizations to Reject

| Rationalization | Why It's Wrong | Required Action |
|-----------------|----------------|-----------------|
| "I'll add physics later" | Players fall through immediately | Add `physics: 'static'` on creation |
| "Position [0,0,0] is fine" | Prim origins are centered, half is underground | Lift by `height / 2` |
| "Math.random() works" | Not available in Hyperfy runtime | Use `num(min, max, dp)` |
| "Might need networking" | Performance cost, complexity | Only add when explicitly required |
| "Looks fine in my test" | Z-fighting varies by angle/distance | Use 0.01m+ offsets for overlapping |
| "Quick prototype, skip cleanup" | Memory leaks accumulate | Always add `destroy` handler |
| "This refactor improves it" | User didn't ask | Only make requested changes |

---

## Randomization

**IMPORTANT:** `Math.random()` is NOT available in the Hyperfy scripting environment.

Use the global `num()` function:

```javascript
// Random integer between 0 and 10
const randomInt = num(0, 10)

// Random float between -5 and 5 with 2 decimal places
const randomFloat = num(-5, 5, 2)
```

**Warning:** `num()` is NOT deterministic across clients. For multiplayer content that must appear identical:
- Store procedurally generated positions in `app.state` on server
- Send state to clients via `app.send()`
- Clients read from `app.state` instead of generating locally

---

## Quick Reference

### Prim Size vs Scale

Prims have TWO sizing properties:

| Property | Purpose | Example |
|----------|---------|---------|
| `size` | Actual geometry dimensions | `size: [2, 1, 3]` = 2x1x3m box |
| `scale` | Transform multiplier (default `[1,1,1]`) | `scale: [2, 2, 2]` = double size |

**Hyperfy examples commonly use `scale` for sizing** because the default geometry is 1 unit. Both approaches work:

```javascript
// Using size (explicit)
app.create('prim', { type: 'box', size: [2, 1, 3] })

// Using scale (common in examples)
app.create('prim', { type: 'box', scale: [2, 1, 3] })
```

### Prim Sizes (origin at center)

| Type | Size Format | Example |
|------|-------------|---------|
| box | `[width, height, depth]` | `[1, 2, 1]` |
| sphere | `[radius]` | `[0.5]` |
| cylinder | `[topRadius, bottomRadius, height]` | `[0.5, 0.5, 2]` |
| cone | `[radius, height]` | `[0.5, 1]` |
| torus | `[radius, tubeRadius]` | `[0.4, 0.1]` |
| plane | `[width, height]` | `[2, 2]` |

### Physics Types

| Type | Use Case |
|------|----------|
| `null` | No collision (decorative, grass) |
| `'static'` | Immovable (walls, floors, furniture) |
| `'kinematic'` | Moved by code (doors, platforms, elevators) |
| `'dynamic'` | Physics-simulated (falling objects, balls) |

### Event Loops

| Event | Rate | Use Case |
|-------|------|----------|
| `update` | Every frame | General logic |
| `fixedUpdate` | Fixed timestep | Physics calculations |
| `animate` | Distance-based | Visual animations |
| `destroy` | On removal | Cleanup handlers |

---

## Decision Trees

### Choosing Node Type

```
Need visuals?
├── Simple shape → prim (box, sphere, cylinder, cone, torus, plane)
├── 2D image → image
├── Video playback → video
├── VRM character → avatar
├── Particle effects → particles
└── UI elements → ui + uitext/uiimage/uiinput/uiview

Need interaction?
├── Click prompt → action
├── Player seating/vehicle → anchor
└── Enter/exit zone → prim with trigger: true

Need hierarchy?
└── Grouping children → group

Need physics body?
├── On prim → use physics prop directly
└── Custom geometry → rigidbody + collider
```

### Choosing Physics Type

```
Does it move?
├── No → 'static' (walls, floors, furniture)
└── Yes
    ├── Moved by script → 'kinematic' (doors, moving platforms)
    └── Physics simulation → 'dynamic' (falling objects)

Is it a trigger zone?
└── Yes → physics: 'static' + trigger: true
```

---

## Workflow Checklists

### New App Checklist

- [ ] Create `.js` file in `world/` or `examples/` folder
- [ ] Use globals directly: `app`, `world`, `props` (NO export wrapper)
- [ ] Real-world dimensions (meters, player ~1.7m tall)
- [ ] Lift prims by height/2 so bottom sits at y=0
- [ ] Add `physics: 'static'` on walkable/solid surfaces
- [ ] No z-fighting (0.01m offsets for touching surfaces)
- [ ] Add `app.on('destroy', () => { ... })` for cleanup

### Adding Networking Checklist

- [ ] Only add if multiplayer sync is required
- [ ] Initialize `app.state` on server
- [ ] Set `app.state.ready = true` after init
- [ ] Send `app.send('init', app.state)` to clients
- [ ] Handle late joiners: check `app.state.ready` on client
- [ ] Use server authority for any randomization

### Adding Interaction Checklist

- [ ] Position action node at interaction point
- [ ] Set appropriate `distance` (default 3m)
- [ ] Set `duration` for hold-to-activate (default 0.5s)
- [ ] Implement `onTrigger` callback
- [ ] For trigger zones: `physics: 'static'`, `trigger: true`
- [ ] Check `e.isLocalPlayer` in trigger callbacks

---

## Quality Gate (Must Pass Before Delivery)

Verify ALL before returning code:

- [ ] No `export default` wrapper (use globals directly)
- [ ] All prims have appropriate physics (static/kinematic/null)
- [ ] Objects sit on ground (lifted by height/2)
- [ ] No overlapping faces causing z-fighting
- [ ] Uses `num()` for randomization (Math.random not available)
- [ ] Server-authoritative state for multiplayer randomization
- [ ] `destroy` handler cleans up event listeners
- [ ] No unnecessary networking or animation
- [ ] Real-world scale (player ~1.7m, can jump ~1.5m high, ~5m far)
- [ ] Uses `app.add()` for all created nodes

---

## Common Patterns

### Basic App Structure

```javascript
// Scripts run directly with globals: app, world, props

// Create content
const floor = app.create('prim', {
  type: 'box',
  scale: [10, 0.2, 10],
  position: [0, 0.1, 0],
  color: '#333333',
  physics: 'static'
})
app.add(floor)

// Cleanup
app.on('destroy', () => {
  // Remove event listeners, cleanup resources
})
```

### Trigger Zone

```javascript
const zone = app.create('prim', {
  type: 'box',
  scale: [4, 4, 4],
  position: [0, 2, 0],
  opacity: 0,
  physics: 'static',
  trigger: true,
  onTriggerEnter: (e) => {
    if (!e.isLocalPlayer) return
    // Player entered
  },
  onTriggerLeave: (e) => {
    if (!e.isLocalPlayer) return
    // Player left
  }
})
app.add(zone)
```

### Networked State

```javascript
if (world.isServer) {
  app.state.score = 0
  app.state.ready = true
  app.send('init', app.state)
}

if (world.isClient) {
  const init = (state) => {
    // Initialize from server state
  }
  if (app.state.ready) {
    init(app.state)
  } else {
    app.on('init', init)
  }
}
```

### Server-Authoritative Randomization

```javascript
// For procedural content that must be identical on all clients
if (world.isServer) {
  app.state.positions = []
  for (let i = 0; i < 10; i++) {
    app.state.positions.push({
      x: num(-10, 10, 2),
      z: num(-10, 10, 2)
    })
  }
  app.state.ready = true
  app.send('init', app.state)
}

if (world.isClient) {
  const init = (state) => {
    state.positions.forEach((pos) => {
      const tree = app.create('prim', { type: 'cylinder' })
      tree.position.set(pos.x, 0, pos.z)
      app.add(tree)
    })
  }
  if (app.state.ready) init(app.state)
  else app.on('init', init)
}
```

---

## Reference Documentation

**Repository**: https://github.com/hyperfy-xyz/hyperfy

### Skill References (task-oriented guides)
- **[references/node-types.md](references/node-types.md)** - Consolidated API for all node types
- **[references/prims-guide.md](references/prims-guide.md)** - Shapes, physics, materials guide
- **[references/networking-patterns.md](references/networking-patterns.md)** - Multiplayer sync patterns
- **[references/common-mistakes.md](references/common-mistakes.md)** - Anti-patterns and fixes

### Official API (for complete property details)
- **App API**: `docs/scripting/app/App.md`
- **World API**: `docs/scripting/world/World.md`
- **Node Types**: `docs/scripting/nodes/` (individual node docs)
- **Networking**: `docs/scripting/Networking.md`
- **Utils**: `docs/scripting/Utils.md`

---

## Environment Context

- Coordinate system: X=Right, Y=Up, Z=Forward (same as three.js)
- Units: Meters
- Player height: ~1.7m
- Player jump: ~1.5m high, ~5m horizontal
- Rotations: Radians (use `DEG2RAD` constant to convert)
- Style: Blocky/voxel/minecraft unless specified otherwise

## Available Globals

Scripts have access to these globals (no imports needed):

- `app` - Current app instance
- `world` - World/environment interface
- `props` - Configured properties
- `num(min, max, dp)` - Random number generator
- `Vector3`, `Quaternion`, `Euler`, `Matrix4` - Three.js math classes
- `fetch()` - Standard Fetch API
- `DEG2RAD` - Degrees to radians constant
