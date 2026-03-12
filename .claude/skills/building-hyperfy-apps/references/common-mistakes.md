# Common Mistakes

Anti-patterns in Hyperfy app development with explanations and fixes.

---

## 1. Missing Physics on Walkable Surfaces

### Bad

```javascript
const floor = app.create('prim', {
  type: 'box',
  scale: [10, 0.2, 10],
  position: [0, 0.1, 0],
  color: '#333333'
})
app.add(floor)
```

### Why It's Wrong

Players fall through surfaces without physics. The default `physics: null` means no collision detection.

### Rationalization to Reject

"I'll add physics later" - Players can't use the app at all if they fall through the floor immediately.

### Good

```javascript
const floor = app.create('prim', {
  type: 'box',
  scale: [10, 0.2, 10],
  position: [0, 0.1, 0],
  color: '#333333',
  physics: 'static'  // Players can walk on it
})
app.add(floor)
```

---

## 2. Wrong Origin Position (Underground Objects)

### Bad

```javascript
const table = app.create('prim', {
  type: 'box',
  scale: [1, 0.8, 0.6],
  position: [0, 0, 0],  // Half the table is underground!
  physics: 'static'
})
```

### Why It's Wrong

Prim origins are at the CENTER. A box with height 0.8 at position y=0 has its center at y=0, meaning the bottom is at y=-0.4 (underground).

### Rationalization to Reject

"Position [0,0,0] is the obvious starting point" - Origins at center means objects need to be lifted.

### Good

```javascript
const table = app.create('prim', {
  type: 'box',
  scale: [1, 0.8, 0.6],
  position: [0, 0.4, 0],  // Lifted by height/2
  physics: 'static'
})
```

---

## 3. Using Math.random() (Not Available)

### Bad

```javascript
// Generate random tree positions
for (let i = 0; i < 10; i++) {
  const tree = app.create('prim', { type: 'cylinder' })
  tree.position.x = Math.random() * 20 - 10  // ERROR: Math.random is not defined
  tree.position.z = Math.random() * 20 - 10
  app.add(tree)
}
```

### Why It's Wrong

`Math.random()` is NOT available in the Hyperfy scripting environment.

### Rationalization to Reject

"Math.random() works fine in JavaScript" - True, but Hyperfy scripts run in a sandboxed environment without Math.random.

### Good

```javascript
// For local-only randomization (different on each client)
for (let i = 0; i < 10; i++) {
  const tree = app.create('prim', { type: 'cylinder' })
  tree.position.x = num(-10, 10, 2)
  tree.position.z = num(-10, 10, 2)
  app.add(tree)
}

// For multiplayer-synchronized randomization, use server authority
// See references/networking-patterns.md Pattern 5
```

---

## 4. Over-Engineering with Unnecessary Features

### Bad

```javascript
// User asked for: "a simple red cube"

// Configuration system
app.configure([
  { key: 'color', type: 'color', label: 'Color', default: '#ff0000' },
  { key: 'size', type: 'number', label: 'Size', default: 1 },
  { key: 'enableRotation', type: 'toggle', label: 'Rotate' }
])

// Networking for future multiplayer
if (world.isServer) {
  app.state.created = Date.now()
  app.state.ready = true
  app.send('init', app.state)
}

// Animation system with toggle
if (props.enableRotation) {
  app.on('animate', (delta) => {
    cube.rotation.y += delta
  })
}

// Interaction
const action = app.create('action', { label: 'Info' })
// ...50 more lines
```

### Why It's Wrong

User asked for a simple red cube. They got a configurable, networked, animated, interactive system. This adds complexity, potential bugs, and performance overhead.

### Rationalization to Reject

"This might be useful later" - Build what's requested. Features can be added when needed.

### Good

```javascript
const cube = app.create('prim', {
  type: 'box',
  scale: [1, 1, 1],
  position: [0, 0.5, 0],
  color: '#ff0000',
  physics: 'static'
})
app.add(cube)
```

---

## 5. Z-Fighting from Overlapping Faces

### Bad

```javascript
// Floor and wall share an edge
const floor = app.create('prim', {
  type: 'box',
  scale: [10, 0.2, 10],
  position: [0, 0.1, 0]
})

const wall = app.create('prim', {
  type: 'box',
  scale: [0.2, 3, 10],
  position: [-5, 1.5, 0]  // Wall edge exactly touches floor edge
})
```

### Why It's Wrong

When two surfaces occupy the same space, the renderer can't decide which to show, causing flickering (z-fighting).

### Rationalization to Reject

"It looks fine in my testing" - Z-fighting depends on camera angle and distance. It will appear for some users.

### Good

```javascript
const floor = app.create('prim', {
  type: 'box',
  scale: [10, 0.2, 10],
  position: [0, 0.1, 0]
})

const wall = app.create('prim', {
  type: 'box',
  scale: [0.2, 3, 10],
  position: [-4.99, 1.5, 0]  // 0.01m offset prevents z-fighting
})
```

---

## 6. Not Handling Late Joiners

### Bad

```javascript
if (world.isServer) {
  app.state.score = 0
  app.state.ready = true
  app.send('init', app.state)
}

if (world.isClient) {
  app.on('init', (state) => {
    displayScore(state.score)
  })
}
```

### Why It's Wrong

If a client connects AFTER the server sends 'init', they never receive it. The `app.on('init', ...)` listener is registered but the event already fired.

### Rationalization to Reject

"It works when I test it" - You're likely testing with server and client starting together. Production has asynchronous connections.

### Good

```javascript
if (world.isServer) {
  app.state.score = 0
  app.state.ready = true
  app.send('init', app.state)
}

if (world.isClient) {
  function init(state) {
    displayScore(state.score)
  }

  // Check if server already initialized
  if (app.state.ready) {
    init(app.state)
  } else {
    app.on('init', init)
  }
}
```

---

## 7. Missing Destroy Cleanup

### Bad

```javascript
const animate = (delta) => {
  cube.rotation.y += delta
}

app.on('animate', animate)

// No cleanup when app is removed/rebuilt
```

### Why It's Wrong

When scripts are hot-reloaded during development or apps are removed, listeners remain attached, causing memory leaks and duplicate handlers.

### Rationalization to Reject

"It's just a simple animation" - Even simple apps need cleanup. Hot reload happens frequently during development.

### Good

```javascript
const animate = (delta) => {
  cube.rotation.y += delta
}

app.on('animate', animate)

app.on('destroy', () => {
  app.off('animate', animate)
})
```

---

## 8. Unrealistic Dimensions

### Bad

```javascript
// "A chair"
const seat = app.create('prim', {
  type: 'box',
  scale: [1, 1, 1],  // 1m cube for a seat?
  position: [0, 0.5, 0]
})
```

### Why It's Wrong

Players are ~1.7m tall. A 1m cube seat is waist-high and massive. Real chair seats are ~0.45m x 0.45m x 0.05m at ~0.45m height.

### Rationalization to Reject

"Default size of 1 is easy" - Real-world dimensions matter for immersion and usability.

### Good

```javascript
// Realistic chair dimensions
const seat = app.create('prim', {
  type: 'box',
  scale: [0.45, 0.05, 0.45],
  position: [0, 0.45, 0],
  physics: 'static'
})
app.add(seat)

const backrest = app.create('prim', {
  type: 'box',
  scale: [0.45, 0.5, 0.05],
  position: [0, 0.7, -0.2],
  physics: 'static'
})
app.add(backrest)
```

---

## 9. Kinematic Physics for Static Objects

### Bad

```javascript
const wall = app.create('prim', {
  type: 'box',
  scale: [5, 3, 0.2],
  physics: 'kinematic'  // Wall never moves!
})
```

### Why It's Wrong

`kinematic` physics has overhead for tracking velocity and position changes. Use `static` for immovable objects.

### Rationalization to Reject

"Kinematic works fine" - It does, but at unnecessary performance cost. Use the right type.

### Good

```javascript
const wall = app.create('prim', {
  type: 'box',
  scale: [5, 3, 0.2],
  physics: 'static'  // Correct: wall doesn't move
})

// Only use kinematic for things that move via code
const elevator = app.create('prim', {
  type: 'box',
  scale: [2, 0.1, 2],
  physics: 'kinematic'  // Correct: elevator moves
})
```

---

## 10. Trigger Zone Without isLocalPlayer Check

### Bad

```javascript
const zone = app.create('prim', {
  type: 'box',
  physics: 'static',
  trigger: true,
  onTriggerEnter: (e) => {
    console.log('Someone entered')  // Fires for ALL players on ALL clients
    giveReward()
  }
})
```

### Why It's Wrong

Trigger events fire on every client for every player. Without `isLocalPlayer` check, the callback runs multiple times per entry.

### Rationalization to Reject

"It works in single-player testing" - Multiplayer scenarios have multiple players and multiple clients.

### Good

```javascript
const zone = app.create('prim', {
  type: 'box',
  physics: 'static',
  trigger: true,
  onTriggerEnter: (e) => {
    if (!e.isLocalPlayer) return  // Only handle local player
    console.log('I entered')
    giveReward()
  }
})
```

---

## 11. Animation Without Delta Time

### Bad

```javascript
app.on('animate', () => {
  cube.rotation.y += 0.01  // Speed depends on frame rate!
})
```

### Why It's Wrong

Frame rate varies by device and distance from camera. Without `delta`, animation speed is inconsistent.

### Rationalization to Reject

"It looks smooth on my machine" - Other devices/distances will have different frame rates.

### Good

```javascript
app.on('animate', (delta) => {
  cube.rotation.y += 45 * DEG2RAD * delta  // 45 degrees per second, consistent
})
```

---

## 12. Adding Nodes Without app.add()

### Bad

```javascript
const cube = app.create('prim', {
  type: 'box',
  position: [0, 0.5, 0]
})
// Forgot app.add(cube)!
```

### Why It's Wrong

Creating a node doesn't make it visible. Nodes must be added to the scene hierarchy with `app.add()`.

### Rationalization to Reject

"I created it, why isn't it showing?" - Creation allocates the object; adding makes it visible.

### Good

```javascript
const cube = app.create('prim', {
  type: 'box',
  position: [0, 0.5, 0]
})
app.add(cube)  // Now it's visible
```

---

## 13. Using num() Without Server Authority for Multiplayer

### Bad

```javascript
// Each client generates DIFFERENT positions
const trees = []
for (let i = 0; i < 10; i++) {
  const tree = app.create('prim', { type: 'cylinder' })
  tree.position.x = num(-10, 10, 2)  // Different on each client!
  tree.position.z = num(-10, 10, 2)
  trees.push(tree)
  app.add(tree)
}
```

### Why It's Wrong

`num()` is NOT deterministic. Each client gets different random values, so procedural content looks different for each player.

### Rationalization to Reject

"It's just decorative trees" - Even decorative content should be consistent in multiplayer so players can reference locations.

### Good

```javascript
// Server generates positions, clients read from state
if (world.isServer) {
  app.state.treePositions = []
  for (let i = 0; i < 10; i++) {
    app.state.treePositions.push({
      x: num(-10, 10, 2),
      z: num(-10, 10, 2)
    })
  }
  app.state.ready = true
  app.send('init', app.state)
}

if (world.isClient) {
  const init = (state) => {
    state.treePositions.forEach(pos => {
      const tree = app.create('prim', { type: 'cylinder' })
      tree.position.set(pos.x, 0, pos.z)
      app.add(tree)
    })
  }

  if (app.state.ready) init(app.state)
  else app.on('init', init)
}
```
