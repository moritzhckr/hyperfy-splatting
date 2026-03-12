# Networking Patterns

Multiplayer synchronization patterns for Hyperfy apps.

## Core Concepts

Scripts execute in **every environment**: once on the server, and once on each connected client.

```javascript
if (world.isServer) {
  // Runs only on server
}

if (world.isClient) {
  // Runs only on clients
}
```

## Communication Methods

| Method | Direction | Scope |
|--------|-----------|-------|
| `app.send(event, data)` | Client → Server, Server → All Clients | Same app instance |
| `app.on(event, fn)` | Receives from counterpart | Same app instance |
| `app.emit(event, data)` | Local only | All apps, same environment |
| `world.on(event, fn)` | Receives emitted events | All apps, same environment |

---

## Pattern 1: Server Authority with Late Joiner Support

The most common pattern. Server owns state, clients react.

```javascript
// Server initializes state
if (world.isServer) {
  app.state.score = 0
  app.state.isOpen = false
  app.state.ready = true

  // Notify any already-connected clients
  app.send('init', app.state)

  // Handle client actions
  app.on('addScore', (data) => {
    app.state.score += data.amount
    app.send('scoreUpdated', { score: app.state.score })
  })
}

// Client handles state
if (world.isClient) {
  let score = 0

  function init(state) {
    score = state.score
    updateDisplay()
  }

  // Handle late joiners
  if (app.state.ready) {
    init(app.state)
  } else {
    app.on('init', init)
  }

  // Listen for updates
  app.on('scoreUpdated', (data) => {
    score = data.score
    updateDisplay()
  })

  function updateDisplay() {
    // Update UI...
  }
}
```

### Why Late Joiner Handling?

When a client connects:
1. Server's `app.state` is sent as a snapshot
2. Client may connect AFTER server has already initialized
3. Check `app.state.ready` to use snapshot, OR wait for `init` event

---

## Pattern 2: Client-Triggered Actions

Player does something, server validates, broadcasts result.

```javascript
if (world.isServer) {
  app.on('playerAction', (data, networkId) => {
    // Validate action
    if (!isValidAction(data)) return

    // Update state
    app.state.lastAction = data

    // Broadcast to all clients
    app.send('actionResult', {
      success: true,
      action: data,
      playerId: networkId
    })
  })
}

if (world.isClient) {
  // User clicks button
  action.onTrigger = () => {
    app.send('playerAction', { type: 'activate' })
  }

  // Handle result
  app.on('actionResult', (data) => {
    if (data.success) {
      playAnimation()
    }
  })
}
```

---

## Pattern 3: Skip Sender

Broadcast to all clients EXCEPT the one who sent the message.

```javascript
if (world.isServer) {
  app.on('playerMoved', (data, networkId) => {
    // Broadcast to everyone except sender
    app.send('otherPlayerMoved', data, networkId)
  })
}

if (world.isClient) {
  // Send own movement
  app.send('playerMoved', { x: 10, y: 0, z: 5 })

  // Only receive OTHER players' movements
  app.on('otherPlayerMoved', (data) => {
    updateOtherPlayer(data)
  })
}
```

---

## Pattern 4: Cross-App Communication

Apps can emit events for other apps to receive (same environment only).

### App 1: Sender

```javascript
if (world.isServer) {
  // Emit event for other apps
  app.emit('doorOpened', { doorId: 'main' })
}
```

### App 2: Receiver

```javascript
if (world.isServer) {
  world.on('doorOpened', (data) => {
    if (data.doorId === 'main') {
      playAlarm()
    }
  })
}
```

### Full Loop Example

```javascript
// App 1
if (world.isClient) {
  app.send('ping', {})
}

if (world.isServer) {
  app.on('ping', () => {
    console.log('Server received ping')
    app.emit('cross-app-ping', {})
  })

  world.on('cross-app-pong', () => {
    app.send('complete', {})
  })
}

// App 2
if (world.isServer) {
  world.on('cross-app-ping', () => {
    console.log('App 2 received ping')
    app.emit('cross-app-pong', {})
  })
}
```

**Flow:**
1. App 1 client sends `ping` to server
2. App 1 server emits `cross-app-ping`
3. App 2 server receives via `world.on`
4. App 2 server emits `cross-app-pong`
5. App 1 server receives, sends `complete` to clients

---

## Pattern 5: Server-Authoritative Randomization

**IMPORTANT:** `Math.random()` is NOT available in Hyperfy. Use `num(min, max, dp)` instead.

**WARNING:** `num()` is NOT deterministic - each client gets different results!

For procedural content that must look the same on all clients, use server authority:

```javascript
// Server generates and shares random values
if (world.isServer) {
  app.state.trees = []
  for (let i = 0; i < 10; i++) {
    app.state.trees.push({
      x: num(-10, 10, 2),
      y: 0,
      z: num(-10, 10, 2)
    })
  }
  app.state.ready = true
  app.send('init', app.state)
}

// Clients use server-generated positions
if (world.isClient) {
  const init = (state) => {
    state.trees.forEach((pos, i) => {
      const tree = app.create('prim', { type: 'cylinder' })
      tree.position.set(pos.x, pos.y, pos.z)
      app.add(tree)
    })
  }

  if (app.state.ready) {
    init(app.state)
  } else {
    app.on('init', init)
  }
}
```

---

## Pattern 6: Synchronized Objects

Objects that need to sync position/rotation across clients.

```javascript
if (world.isServer) {
  app.state.objects = {}

  app.on('moveObject', (data) => {
    app.state.objects[data.id] = {
      position: data.position,
      rotation: data.rotation
    }
    app.send('objectMoved', data)
  })
}

if (world.isClient) {
  const objects = {}

  // Initialize from state
  if (app.state.ready) {
    for (const [id, data] of Object.entries(app.state.objects)) {
      createObject(id, data)
    }
  }

  app.on('objectMoved', (data) => {
    if (objects[data.id]) {
      objects[data.id].position.set(...data.position)
      objects[data.id].rotation.set(...data.rotation)
    }
  })
}
```

---

## Pattern 7: Periodic State Sync

For frequently changing state, batch updates.

```javascript
if (world.isServer) {
  let dirty = false

  app.on('update', () => {
    if (dirty) {
      app.send('stateSync', app.state)
      dirty = false
    }
  })

  app.on('playerAction', (data) => {
    // Modify state...
    dirty = true
  })
}
```

---

## Common Mistakes

### 1. Missing Late Joiner Handling

```javascript
// BAD: Client waits forever if server already initialized
if (world.isClient) {
  app.on('init', init) // Missed if server was faster
}

// GOOD: Check state first
if (world.isClient) {
  if (app.state.ready) {
    init(app.state)
  } else {
    app.on('init', init)
  }
}
```

### 2. Using Math.random() (Not Available)

```javascript
// BAD: Math.random() is not available
const color = ['red', 'blue', 'green'][Math.floor(Math.random() * 3)]

// GOOD: Use num() with server authority
if (world.isServer) {
  app.state.colorIndex = num(0, 2)
  app.state.ready = true
}
```

### 3. Forgetting Server Authority

```javascript
// BAD: Client directly modifies shared state
if (world.isClient) {
  score += 10 // Other clients don't see this
}

// GOOD: Client requests, server broadcasts
if (world.isClient) {
  app.send('addScore', { amount: 10 })
}

if (world.isServer) {
  app.on('addScore', (data) => {
    app.state.score += data.amount
    app.send('scoreUpdated', { score: app.state.score })
  })
}
```

### 4. Not Cleaning Up Listeners

```javascript
// GOOD: Remove listeners on destroy
const handleEvent = (data) => { /* ... */ }
app.on('someEvent', handleEvent)

app.on('destroy', () => {
  app.off('someEvent', handleEvent)
})
```

---

## Network ID

Every client/server has a unique `world.networkId`. Use this to identify message senders.

```javascript
if (world.isServer) {
  app.on('playerAction', (data, networkId) => {
    console.log(`Action from client: ${networkId}`)

    // Skip sending back to originator
    app.send('actionResult', data, networkId)
  })
}
```

---

## Performance Tips

1. **Minimize message frequency** - batch updates when possible
2. **Send minimal data** - only what changed
3. **Skip originator** - don't echo back to sender
4. **Use state for reconnection** - late joiners get `app.state` snapshot
5. **Validate on server** - never trust client data
