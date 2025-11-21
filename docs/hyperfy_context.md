You're asking for a summary of Hyperfy's architecture and the `.hyp` app functionality to provide as context to a coding AI assistant.<cite />

## Architecture Overview

Hyperfy is a **client-server virtual world platform** built on a modular system architecture: [1](#0-0) 

### Core Components

**World System**: The central orchestrator that manages all subsystems through a unified lifecycle. [2](#0-1)  Key systems include:
- `Apps` - Script runtime and API provision
- `Entities` - Object lifecycle management  
- `Physics` - PhysX-based simulation
- `Stage` - 3D scene graph
- `Blueprints` - App template definitions
- `Network` - WebSocket-based synchronization<cite />

**Game Loop**: Fixed timestep at 50Hz for physics (`fixedDeltaTime: 1/50`), with variable frame rate rendering and 8Hz network updates (`networkRate: 1/8`). [3](#0-2) 

**Client-Server Model**: Multiple browser clients connect via WebSocket to a Fastify server with SQLite persistence. [4](#0-3)  The server maintains authoritative state synchronized to all clients.<cite />

## App Entity System

**Apps** are the primary interactive objects - combining 3D models (GLB/VRM) with JavaScript scripts: [5](#0-4) 

### App Lifecycle

1. **Creation**: Instantiated from a Blueprint definition [6](#0-5) 
2. **Build**: Loads 3D model and script, executes in sandboxed environment [7](#0-6) 
3. **Active**: Receives `fixedUpdate`, `update`, `lateUpdate` events [8](#0-7) 
4. **Network Sync**: Position/rotation interpolated across clients [9](#0-8) 
5. **Destroy**: Cleanup via `unbuild()` [10](#0-9) 

### Script Runtime

Scripts execute in a **secure SES Compartment** with limited globals (`console`, `Math`, `THREE` classes).<cite /> The `Apps` system provides two proxy APIs:

**World API** - Global functionality: [11](#0-10) 
- Network queries: `networkId`, `isServer`, `isClient`
- Physics: `raycast()`, `overlapSphere()`
- Players: `getPlayer()`, `getPlayers()`
- Events: `on()`, `emit()` [12](#0-11) 

**App API** - Instance-specific: [13](#0-12) 
- Identity: `instanceId`, `version`, `state`
- Networking: `send()`, `sendTo()` for client-server communication [14](#0-13) 
- Scene: `create()` for dynamic node creation
- Configuration: `configure()` for custom properties<cite />

### Networking Model

Apps run **on both server and all clients**. [15](#0-14)  Communication patterns:
- `app.send()` - Client→Server or Server→All Clients
- `app.emit()` - Local cross-app events (same environment)
- `world.on()` - Listen to cross-app events [16](#0-15) 

## .hyp File Format

`.hyp` files are **packaged apps** containing: [17](#0-16) 
- Blueprint metadata (name, author, props, script URL, model URL)
- Embedded assets (GLB models, scripts)
- Can replace entire scenes or spawn individual apps [18](#0-17) 

When imported, assets are uploaded to the world's asset storage and the blueprint is registered in the database. [19](#0-18) 

## Notes

The platform uses Three.js 0.173.0 for rendering, PhysX for physics, and supports WebXR for VR.<cite /> Voice chat is handled via LiveKit.<cite /> The builder system allows real-time in-world content creation with drag-and-drop support for GLB, VRM, and HYP files.<cite />

Wiki pages you might want to explore:
- [Overview (hyperfy-xyz/hyperfy)](/wiki/hyperfy-xyz/hyperfy#1)
- [World System (hyperfy-xyz/hyperfy)](/wiki/hyperfy-xyz/hyperfy#2.1)
- [App Entities (hyperfy-xyz/hyperfy)](/wiki/hyperfy-xyz/hyperfy#3.1)

### Citations

**File:** README.md (L1-8)
```markdown
# Hyperfy ⚡️

<div align="center">
  <img src="overview.png" alt="Hyperfy Ecosystem" width="100%" />
  <p>
    <strong>Build, deploy, and experience interactive 3D virtual worlds</strong>
  </p>
</div>
```

**File:** README.md (L10-22)
```markdown
## What is Hyperfy?

Hyperfy is an open-source framework for building interactive 3D virtual worlds. It combines a powerful physics engine, networked real-time collaboration, and a component-based application system to create immersive experiences that can be self-hosted or connected to the wider Hyperfy ecosystem.

## 🧬 Key Features

- **Standalone persistent worlds** - Host on your own domain
- **Realtime content creation** - Build directly in-world
- **Interactive app system** - Create dynamic applications with JavaScript
- **Portable avatars** - Connect via Hyperfy for consistent identity
- **Physics-based interactions** - Built on PhysX for realistic simulation
- **WebXR support** - Experience worlds in VR
- **Extensible architecture** - Highly customizable for various use cases
```

**File:** src/core/entities/App.js (L23-44)
```javascript
export class App extends Entity {
  constructor(world, data, local) {
    super(world, data, local)
    this.isApp = true
    this.n = 0
    this.worldNodes = new Set()
    this.hotEvents = 0
    this.worldListeners = new Map()
    this.listeners = {}
    this.eventQueue = []
    this.snaps = []
    this.root = createNode('group')
    this.fields = []
    this.target = null
    this.projectLimit = Infinity
    this.keepActive = false
    this.playerProxies = new Map()
    this.hitResultsPool = []
    this.hitResults = []
    this.deadHook = { dead: false }
    this.build()
  }
```

**File:** src/core/entities/App.js (L51-62)
```javascript
  async build(crashed) {
    this.building = true
    const n = ++this.n
    // fetch blueprint
    const blueprint = this.world.blueprints.get(this.data.blueprint)

    if (blueprint.disabled) {
      this.unbuild()
      this.blueprint = blueprint
      this.building = false
      return
    }
```

**File:** src/core/entities/App.js (L76-96)
```javascript
      try {
        const type = blueprint.model.endsWith('vrm') ? 'avatar' : 'model'
        let glb = this.world.loader.get(type, blueprint.model)
        if (!glb) glb = await this.world.loader.load(type, blueprint.model)
        root = glb.toNodes()
      } catch (err) {
        console.error(err)
        crashed = true
        // no model, will use crash block below
      }
      // fetch script (if any)
      if (blueprint.script) {
        try {
          script = this.world.loader.get('script', blueprint.script)
          if (!script) script = await this.world.loader.load('script', blueprint.script)
        } catch (err) {
          console.error(err)
          crashed = true
        }
      }
    }
```

**File:** src/core/entities/App.js (L148-150)
```javascript
    this.networkPos = new LerpVector3(root.position, this.world.networkRate)
    this.networkQuat = new LerpQuaternion(root.quaternion, this.world.networkRate)
    this.networkSca = new LerpVector3(root.scale, this.world.networkRate)
```

**File:** src/core/entities/App.js (L162-192)
```javascript
  unbuild() {
    // notify any running script
    this.emit('destroy')
    // cancel any control
    this.control?.release()
    this.control = null
    // cancel any effects
    this.playerProxies.forEach(player => {
      player.$cleanup()
    })
    // deactivate local node
    this.root?.deactivate()
    // deactivate world nodes
    for (const node of this.worldNodes) {
      node.deactivate()
    }
    this.worldNodes.clear()
    // clear script event listeners
    this.clearEventListeners()
    this.hotEvents = 0
    // cancel update tracking
    this.world.setHot(this, false)
    // abort fetch's etc
    this.abortController?.abort()
    this.abortController = null
    // mark dead and re-create hook (timers, async etc)
    this.deadHook.dead = true
    this.deadHook = { dead: false }
    // clear fields
    this.onFields?.([])
  }
```

**File:** src/core/entities/App.js (L194-226)
```javascript
  fixedUpdate(delta) {
    // script fixedUpdate()
    if (this.mode === Modes.ACTIVE && this.script) {
      try {
        this.emit('fixedUpdate', delta)
      } catch (err) {
        console.error('script fixedUpdate crashed', this)
        console.error(err)
        this.crash()
        return
      }
    }
  }

  update(delta) {
    // if someone else is moving the app, interpolate updates
    if (this.data.mover && this.data.mover !== this.world.network.id) {
      this.networkPos.update(delta)
      this.networkQuat.update(delta)
      this.networkSca.update(delta)
    }
    // script update()
    if (this.mode === Modes.ACTIVE && this.script) {
      try {
        this.emit('update', delta)
      } catch (err) {
        console.error('script update() crashed', this)
        console.error(err)
        this.crash()
        return
      }
    }
  }
```

**File:** src/core/systems/Apps.js (L39-53)
```javascript
  initWorldHooks() {
    const self = this
    const world = this.world
    const allowLoaders = ['avatar', 'model']
    this.worldGetters = {
      networkId(entity) {
        return world.network.id
      },
      isServer(entity) {
        return world.network.isServer
      },
      isClient(entity) {
        return world.network.isClient
      },
    }
```

**File:** src/core/systems/Apps.js (L92-104)
```javascript
      on(entity, name, callback) {
        entity.onWorldEvent(name, callback)
      },
      off(entity, name, callback) {
        entity.offWorldEvent(name, callback)
      },
      emit(entity, name, data) {
        if (internalEvents.includes(name)) {
          return console.error(`apps cannot emit internal events (${name})`)
        }
        warn('world.emit() is deprecated, use app.emit() instead')
        world.events.emit(name, data)
      },
```

**File:** src/core/systems/Apps.js (L277-345)
```javascript
    this.appMethods = {
      on(entity, name, callback) {
        entity.on(name, callback)
      },
      off(entity, name, callback) {
        entity.off(name, callback)
      },
      send(entity, name, data, ignoreSocketId) {
        if (internalEvents.includes(name)) {
          return console.error(`apps cannot send internal events (${name})`)
        }
        // NOTE: on the client ignoreSocketId is a no-op because it can only send events to the server
        const event = [entity.data.id, entity.blueprint.version, name, data]
        world.network.send('entityEvent', event, ignoreSocketId)
      },
      sendTo(entity, playerId, name, data) {
        if (internalEvents.includes(name)) {
          return console.error(`apps cannot send internal events (${name})`)
        }
        if (!world.network.isServer) {
          throw new Error('sendTo can only be called on the server')
        }
        const player = world.entities.get(playerId)
        if (!player) return
        const event = [entity.data.id, entity.blueprint.version, name, data]
        world.network.sendTo(playerId, 'entityEvent', event)
      },
      emit(entity, name, data) {
        if (internalEvents.includes(name)) {
          return console.error(`apps cannot emit internal events (${name})`)
        }
        world.events.emit(name, data)
      },
      create(entity, name, data) {
        const node = entity.createNode(name, data)
        return node.getProxy()
      },
      control(entity, options) {
        entity.control?.release()
        // TODO: only allow on user interaction
        // TODO: show UI with a button to release()
        entity.control = world.controls.bind({
          ...options,
          priority: ControlPriorities.APP,
          object: entity,
        })
        return entity.control
      },
      configure(entity, fnOrArray) {
        if (isArray(fnOrArray)) {
          entity.fields = fnOrArray
        } else if (isFunction(fnOrArray)) {
          entity.fields = fnOrArray() // deprecated
        }
        if (!isArray(entity.fields)) {
          entity.fields = []
        }
        const props = entity.blueprint.props
        for (const field of entity.fields) {
          // apply file shortcuts
          fileRemaps[field.type]?.(field)
          // apply any initial values
          if (field.initial !== undefined && props[field.key] === undefined) {
            props[field.key] = field.initial
          }
        }
        entity.onFields?.(entity.fields)
      },
    }
```

**File:** docs/scripting/Networking.md (L7-14)
```markdown
Apps execute their scripts in every environment, eg on the server and on every client.

The `world.isServer` and `world.isClient` allows scripts to determine what environment they are running in.

* `app.send`: Sends an event to other instances of the same app. When called on a server is sent to all clients, and when called on a client is sent to the server.
* `app.on`: Listens for an event sent from an app (via `app.send`) in its counter-environment (server or clients).
* `app.emit`: Emits an event for any app to listen to, in the same environment it was called from (either a single client or the server).
* `world.on`: Listens for an event emitted from any app (via `app.emit`) in the same environment.
```

**File:** docs/scripting/Networking.md (L50-56)
```markdown
## Flow

1. App 1 (client) sends ping via `app.send`.
2. App 1 (server) receives ping via `app.on`, emits `cross-app-ping` to other apps.
3. App 2 (server) listens for `cross-app-ping` via `world.on`, emits `cross-app-pong`.
4. App 1 (server) listens for `cross-app-pong` via `world.on`, sends `end` to itself.
```

**File:** src/core/systems/ClientBuilder.js (L764-808)
```javascript
  async addApp(file, transform) {
    const info = await importApp(file)
    for (const asset of info.assets) {
      this.world.loader.insert(asset.type, asset.url, asset.file)
    }
    // if scene, update existing scene
    if (info.blueprint.scene) {
      const confirmed = await this.world.ui.confirm({
        title: 'Scene',
        message: 'Do you want to replace your current scene with this one?',
        confirmText: 'Replace',
        cancelText: 'Cancel',
      })
      if (!confirmed) return
      // modify blueprint optimistically
      const blueprint = this.world.blueprints.getScene()
      const change = {
        id: blueprint.id,
        version: blueprint.version + 1,
        name: info.blueprint.name,
        image: info.blueprint.image,
        author: info.blueprint.author,
        url: info.blueprint.url,
        desc: info.blueprint.desc,
        model: info.blueprint.model,
        script: info.blueprint.script,
        props: info.blueprint.props,
        preload: info.blueprint.preload,
        public: info.blueprint.public,
        locked: info.blueprint.locked,
        frozen: info.blueprint.frozen,
        unique: info.blueprint.unique,
        scene: info.blueprint.scene,
        disabled: info.blueprint.disabled,
      }
      this.world.blueprints.modify(change)
      // upload assets
      const promises = info.assets.map(asset => {
        return this.world.network.upload(asset.file)
      })
      await Promise.all(promises)
      // publish blueprint change for all
      this.world.network.send('blueprintModified', change)
      return
    }
```

**File:** src/core/systems/ClientBuilder.js (L810-854)
```javascript
    const blueprint = {
      id: uuid(),
      version: 0,
      name: info.blueprint.name,
      image: info.blueprint.image,
      author: info.blueprint.author,
      url: info.blueprint.url,
      desc: info.blueprint.desc,
      model: info.blueprint.model,
      script: info.blueprint.script,
      props: info.blueprint.props,
      preload: info.blueprint.preload,
      public: info.blueprint.public,
      locked: info.blueprint.locked,
      frozen: info.blueprint.frozen,
      unique: info.blueprint.unique,
      scene: info.blueprint.scene,
      disabled: info.blueprint.disabled,
    }
    const data = {
      id: uuid(),
      type: 'app',
      blueprint: blueprint.id,
      position: transform.position,
      quaternion: transform.quaternion,
      scale: [1, 1, 1],
      mover: null,
      uploader: this.world.network.id,
      pinned: false,
      state: {},
    }
    this.world.blueprints.add(blueprint, true)
    const app = this.world.entities.add(data, true)
    const promises = info.assets.map(asset => {
      return this.world.network.upload(asset.file)
    })
    try {
      await Promise.all(promises)
      app.onUploaded()
    } catch (err) {
      console.error('failed to upload .hyp assets')
      console.error(err)
      app.destroy()
    }
  }
```

**File:** src/server/db.js (L313-356)
```javascript
      const rootDir = path.join(__dirname, '../')
      const scenePath = path.join(rootDir, 'src/world/scene.hyp')
      const buffer = await fs.readFile(scenePath)
      const file = new File([buffer], 'scene.hyp', {
        type: 'application/octet-stream',
      })
      const app = await importApp(file)
      // write the assets to the worlds assets folder
      for (const asset of app.assets) {
        const filename = asset.url.split('asset://').pop()
        const buffer = Buffer.from(await asset.file.arrayBuffer())
        const dest = path.join(worldDir, '/assets', filename)
        await fs.writeFile(dest, buffer)
      }
      // create blueprint and entity
      app.blueprint.id = '$scene' // singleton
      app.blueprint.preload = true
      const blueprint = {
        id: app.blueprint.id,
        data: JSON.stringify(app.blueprint),
        createdAt: now,
        updatedAt: now,
      }
      await db('blueprints').insert(blueprint)
      const entityId = uuid()
      const entity = {
        id: entityId,
        data: JSON.stringify({
          id: entityId,
          type: 'app',
          blueprint: blueprint.id,
          position: [0, 0, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
          mover: null,
          uploader: null,
          pinned: false,
          state: {},
        }),
        createdAt: now,
        updatedAt: now,
      }
      await db('entities').insert(entity)
    }
```
