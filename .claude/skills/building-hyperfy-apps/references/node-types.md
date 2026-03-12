# Node Types Reference

Complete API reference for all Hyperfy node types.

## Base Node Properties

All nodes inherit these properties:

| Property | Type | Description |
|----------|------|-------------|
| `.id` | String | Node identifier |
| `.active` | Boolean | Whether node is active |
| `.position` | Vector3 | Local position (meters) |
| `.rotation` | Euler | Local rotation (radians, YXZ order) |
| `.quaternion` | Quaternion | Local rotation as quaternion |
| `.scale` | Vector3 | Local scale |
| `.matrixWorld` | Matrix4 | World transform matrix |
| `.parent` | Node | Parent node |
| `.children` | Array | Child nodes |

### Base Node Methods

| Method | Description |
|--------|-------------|
| `.add(node)` | Add child node |
| `.remove(node)` | Remove child node |
| `.clone(deep)` | Clone node (deep=true clones children) |
| `.traverse(fn)` | Walk node tree |

### Pointer Events (on nodes with visuals)

| Callback | Description |
|----------|-------------|
| `.onPointerEnter` | Pointer enters node |
| `.onPointerLeave` | Pointer leaves node |
| `.onPointerDown` | Pointer pressed on node |
| `.onPointerUp` | Pointer released on node |

---

## Prim

Primitive 3D shapes with built-in geometry and optional physics.

```javascript
const box = app.create('prim', {
  type: 'box',
  scale: [1, 2, 1],
  position: [0, 1, 0],
  color: '#ff0000',
  physics: 'static'
})
app.add(box)
```

### Size vs Scale

Prims support TWO sizing mechanisms:

| Property | Purpose | Default |
|----------|---------|---------|
| `size` | Actual geometry dimensions | Varies by type |
| `scale` | Transform multiplier | `[1, 1, 1]` |

**Hyperfy examples commonly use `scale`** because default geometry is 1 unit. Both work:
- `size: [2, 1, 3]` - Explicit 2x1x3m box geometry
- `scale: [2, 1, 3]` - Default 1x1x1 box scaled to 2x1x3m

### Prim Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.type` | String | `'box'` | Shape: `box`, `sphere`, `cylinder`, `cone`, `torus`, `plane` |
| `.size` | Array | varies | Dimensions (see size formats below) |
| `.color` | String | `'#ffffff'` | Hex color |
| `.emissive` | String | `null` | Glow color |
| `.emissiveIntensity` | Number | `1` | Glow strength (0-10+) |
| `.metalness` | Number | `0.2` | Metal look (0-1) |
| `.roughness` | Number | `0.8` | Surface roughness (0-1) |
| `.opacity` | Number | `1` | Transparency (0-1) |
| `.transparent` | Boolean | `false` | Enable transparency |
| `.texture` | String | `null` | Texture URL |
| `.castShadow` | Boolean | `true` | Cast shadows |
| `.receiveShadow` | Boolean | `true` | Receive shadows |
| `.doubleside` | Boolean | `false` | Render both sides |

### Prim Size Formats

| Type | Format | Default | Origin |
|------|--------|---------|--------|
| box | `[width, height, depth]` | `[1, 1, 1]` | Center |
| sphere | `[radius]` | `[0.5]` | Center |
| cylinder | `[radiusTop, radiusBottom, height]` | `[0.5, 0.5, 1]` | Center |
| cone | `[radius, height]` | `[0.5, 1]` | Center |
| torus | `[radius, tubeRadius]` | `[0.4, 0.1]` | Center |
| plane | `[width, height]` | `[1, 1]` | Center |

### Prim Physics Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.physics` | String | `null` | `null`, `'static'`, `'kinematic'`, `'dynamic'` |
| `.mass` | Number | `1` | Mass for dynamic bodies |
| `.linearDamping` | Number | `0` | Linear velocity damping |
| `.angularDamping` | Number | `0.05` | Angular velocity damping |
| `.staticFriction` | Number | `0.6` | Friction at rest |
| `.dynamicFriction` | Number | `0.6` | Friction when moving |
| `.restitution` | Number | `0` | Bounciness (0-1) |
| `.layer` | String | `'environment'` | Collision layer |
| `.trigger` | Boolean | `false` | Trigger volume (no collision) |
| `.tag` | String | `null` | Physics tag for raycasting |

### Prim Physics Callbacks

| Callback | Description |
|----------|-------------|
| `.onContactStart(other)` | Contact with physics body begins |
| `.onContactEnd(other)` | Contact with physics body ends |
| `.onTriggerEnter(e)` | Body enters trigger (requires `trigger: true`) |
| `.onTriggerLeave(e)` | Body leaves trigger (requires `trigger: true`) |

---

## Group

Container node for organizing hierarchy. No visual representation.

```javascript
const wheel = app.create('group')
wheel.add(tire)
wheel.add(hub)
wheel.position.set(1, 0.5, 2)
app.add(wheel)
```

Useful for:
- Grouping related objects
- Changing pivot points
- Cloning complex assemblies

---

## Image

2D image surface rendered in 3D space.

```javascript
const poster = app.create('image', {
  src: props.image?.url,
  width: 2,
  height: 1.5
})
app.add(poster)
```

### Image Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.src` | String | `null` | Image URL |
| `.width` | Number | `1` | Width in meters |
| `.height` | Number | `1` | Height in meters |
| `.fit` | String | `'contain'` | `'contain'`, `'cover'`, `'none'` |
| `.pivot` | String | `'center'` | Anchor point |
| `.lit` | Boolean | `false` | Affected by lighting |
| `.doubleside` | Boolean | `false` | Render both sides |

---

## Audio

Spatial or global audio playback.

```javascript
const sound = app.create('audio', {
  src: props.audio?.url,
  volume: 0.8,
  loop: true,
  spatial: true
})
app.add(sound)
sound.play()
```

### Audio Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.src` | String | - | Audio URL (mp3 only) |
| `.volume` | Number | `1` | Volume (0-1) |
| `.loop` | Boolean | `false` | Loop playback |
| `.group` | String | `'music'` | `'music'` or `'sfx'` |
| `.spatial` | Boolean | `true` | Positional audio |
| `.distanceModel` | String | `'inverse'` | `'linear'`, `'inverse'`, `'exponential'` |
| `.refDistance` | Number | `1` | Reference distance |
| `.maxDistance` | Number | `40` | Maximum audible distance |
| `.rolloffFactor` | Number | `3` | Volume falloff rate |
| `.currentTime` | Number | - | Current playback time |

### Audio Methods

| Method | Description |
|--------|-------------|
| `.play()` | Start playback |
| `.pause()` | Pause (retain position) |
| `.stop()` | Stop and reset to start |

---

## Video

Video playback on a plane or custom geometry.

```javascript
const screen = app.create('video', {
  src: props.video?.url,
  width: 4,
  height: 2.25,
  loop: true
})
app.add(screen)
screen.play()
```

### Video Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.src` | String | - | Video URL (mp4, m3u8) |
| `.width` | Number | `null` | Width in meters |
| `.height` | Number | `null` | Height in meters |
| `.aspect` | Number | - | Aspect ratio for custom geometry |
| `.fit` | String | `'contain'` | `'none'`, `'contain'`, `'cover'` |
| `.loop` | Boolean | `false` | Loop playback |
| `.linked` | Boolean/String | `false` | Sync multiple video nodes |
| `.visible` | Boolean | `true` | Show video surface |
| `.volume` | Number | `1` | Audio volume |
| `.spatial` | Boolean | `true` | Positional audio |
| `.geometry` | Geometry | `null` | Custom projection surface |
| `.isPlaying` | Boolean | - | Read-only playback state |
| `.currentTime` | Number | - | Current playback time |

### Video Methods

| Method | Description |
|--------|-------------|
| `.play()` | Start playback |
| `.pause()` | Pause (retain position) |
| `.stop()` | Stop and reset |

---

## Action

Interactive trigger that shows a label when players approach.

```javascript
const action = app.create('action', {
  label: 'Open Door',
  position: [0, 1, 0],
  duration: 0.5,
  onTrigger: () => {
    door.rotation.y = 90 * DEG2RAD
  }
})
app.add(action)
```

### Action Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.label` | String | `'Interact'` | Display text |
| `.distance` | Number | `3` | Activation range (meters) |
| `.duration` | Number | `0.5` | Hold time to trigger (seconds) |

### Action Callbacks

| Callback | Description |
|----------|-------------|
| `.onStart` | Interact button pressed |
| `.onTrigger` | Held for full duration |
| `.onCancel` | Released before duration |

---

## Anchor

Attachment point for players (seating, vehicles).

```javascript
const seat = app.create('anchor', { id: 'driver-seat' })
seat.position.set(0, 0.5, 0)
car.add(seat)

// Later, attach player:
player.applyEffect({ anchor: seat })
```

**Important:** Always give anchors a unique `id` within your app.

---

## Avatar

VRM avatar rendering.

```javascript
const npc = app.create('avatar', {
  src: props.avatar?.url
})
app.add(npc)
```

### Avatar Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.src` | String | - | VRM file URL |
| `.emote` | String | `null` | Current emote |
| `.visible` | Boolean | `true` | Visibility |

### Avatar Methods

| Method | Description |
|--------|-------------|
| `.getHeight()` | Get avatar height |
| `.getBoneTransform(boneName)` | Get bone world transform |

---

## Particles

VFX particle emitter system.

```javascript
const fire = app.create('particles', {
  shape: ['cone', 0.5, 1, 15],
  rate: 50,
  life: '1~2',
  speed: '1~3',
  color: 'orange',
  alphaOverLife: '0,1|0.5,1|1,0'
})
app.add(fire)
```

### Particles Shape Formats

| Shape | Format |
|-------|--------|
| point | `['point']` |
| sphere | `['sphere', radius, thickness]` |
| hemisphere | `['hemisphere', radius, thickness]` |
| cone | `['cone', radius, thickness, angle]` |
| box | `['box', width, height, depth, thickness, origin, spherize]` |
| circle | `['circle', radius, thickness, spherize]` |
| rectangle | `['rectangle', width, depth, thickness, spherize]` |

- `thickness`: 0 = surface only, 1 = full volume
- `spherize`: direction from center (true) or face normal (false)

### Particles Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.emitting` | Boolean | `true` | Emit particles |
| `.shape` | Array | `['cone', 1, 1, 25]` | Emitter shape |
| `.rate` | Number | `10` | Particles per second |
| `.bursts` | Array | `[]` | `[{time, count}, ...]` |
| `.duration` | Number | `5` | Cycle duration |
| `.loop` | Boolean | `true` | Loop cycles |
| `.max` | Number | `1000` | Max particles |
| `.life` | String | `'5'` | Particle lifetime |
| `.speed` | String | `'1'` | Initial speed |
| `.size` | String | `'1'` | Particle size |
| `.color` | String | `'white'` | Particle color |
| `.alpha` | String | `'1'` | Particle opacity |
| `.emissive` | String | `'1'` | Glow intensity |
| `.image` | String | `null` | Particle texture URL |
| `.blending` | String | `'normal'` | `'normal'` or `'additive'` |

### Particles Value Syntax

Properties like `life`, `speed`, `size` support:
- **Fixed:** `'5'` (always 5)
- **Linear:** `'1-5'` (1 at start, 5 at end of cycle)
- **Random:** `'1~5'` (random between 1-5)

### Particles Over-Life Properties

| Property | Description |
|----------|-------------|
| `.sizeOverLife` | `'0,1|0.5,2|1,1'` (time,value pairs) |
| `.colorOverLife` | `'0,red|1,blue'` |
| `.alphaOverLife` | `'0,1|1,0'` (fade out) |
| `.rotateOverLife` | Degrees |
| `.emissiveOverLife` | Glow over time |

### Particles Dynamics

| Property | Type | Description |
|----------|------|-------------|
| `.force` | Vector3 | Constant force (gravity: `new Vector3(0, -9.81, 0)`) |
| `.velocityLinear` | Vector3 | Linear velocity per axis |
| `.velocityOrbital` | Vector3 | Orbital spin velocity |
| `.velocityRadial` | Number | Push away from center |
| `.rateOverDistance` | Number | Emit based on movement |

---

## UI

Canvas-based UI in world or screen space.

```javascript
const ui = app.create('ui', {
  space: 'world',
  width: 200,
  height: 100,
  size: 0.01, // 200px = 2m
  backgroundColor: 'rgba(0,0,0,0.8)',
  padding: 10
})
const text = app.create('uitext', {
  value: 'Hello World',
  fontSize: 24,
  color: 'white'
})
ui.add(text)
app.add(ui)
```

### UI Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.space` | String | `'world'` | `'world'` or `'screen'` |
| `.width` | Number | `100` | Canvas width (pixels) |
| `.height` | Number | `100` | Canvas height (pixels) |
| `.size` | Number | `0.01` | Pixel to meter ratio |
| `.lit` | Boolean | `false` | Affected by lighting |
| `.doubleside` | Boolean | `false` | Render both sides |
| `.billboard` | String | `'none'` | `'none'`, `'full'`, `'y'` |
| `.pivot` | String | `'center'` | Anchor point |
| `.offset` | Vector3 | - | Pixel offset (screen space) |
| `.scaler` | Array | `null` | `[minDist, maxDist]` for distance scaling |
| `.pointerEvents` | Boolean | `true` | Interactive |
| `.backgroundColor` | String | `null` | Background color |
| `.borderWidth` | Number | - | Border thickness |
| `.borderColor` | String | - | Border color |
| `.borderRadius` | Number | - | Corner radius |
| `.padding` | Number | `0` | Inner padding |
| `.flexDirection` | String | `'column'` | `'row'`, `'column'`, etc. |
| `.justifyContent` | String | `'flex-start'` | Main axis alignment |
| `.alignItems` | String | `'stretch'` | Cross axis alignment |
| `.gap` | Number | `0` | Child spacing |

---

## UIText

Text element inside UI.

```javascript
const label = app.create('uitext', {
  value: 'Score: 100',
  fontSize: 18,
  color: 'white',
  fontWeight: 'bold'
})
ui.add(label)
```

### UIText Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.value` | String | - | Text content |
| `.fontSize` | Number | - | Font size (pixels) |
| `.color` | String | - | Text color |
| `.fontFamily` | String | - | Font family |
| `.fontWeight` | String | - | `'normal'`, `'bold'` |
| `.textAlign` | String | - | `'left'`, `'center'`, `'right'` |

---

## UIInput

Text input field inside UI.

```javascript
const input = app.create('uiinput', {
  placeholder: 'Enter name...',
  fontSize: 16,
  onSubmit: (value) => {
    console.log('Submitted:', value)
  }
})
ui.add(input)
```

### UIInput Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.value` | String | - | Current value |
| `.placeholder` | String | - | Placeholder text |
| `.fontSize` | Number | - | Font size |
| `.backgroundColor` | String | - | Background |
| `.borderColor` | String | - | Border color |

### UIInput Callbacks

| Callback | Description |
|----------|-------------|
| `.onFocus` | Input focused |
| `.onBlur` | Input lost focus |
| `.onChange(value)` | Value changed |
| `.onSubmit(value)` | Enter pressed |

---

## UIImage

Image inside UI.

```javascript
const icon = app.create('uiimage', {
  src: 'icon.png',
  width: 32,
  height: 32
})
ui.add(icon)
```

---

## UIView

Container inside UI for layout grouping.

```javascript
const row = app.create('uiview', {
  flexDirection: 'row',
  gap: 10
})
row.add(button1)
row.add(button2)
ui.add(row)
```

---

## WebView

Embedded iframe in world or screen space.

```javascript
const webview = app.create('webview', {
  space: 'world',
  src: 'https://example.com',
  width: 400,
  height: 300
})
app.add(webview)
```

### WebView Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.space` | String | - | `'world'` or `'screen'` |
| `.src` | String | - | URL to load |
| `.html` | String | - | Raw HTML content |
| `.width` | Number | - | Width (pixels) |
| `.height` | Number | - | Height (pixels) |
| `.factor` | Number | - | Scale factor |
| `.doubleside` | Boolean | - | Render both sides |

---

## RigidBody

Physics body for custom geometry.

```javascript
const body = app.create('rigidbody', {
  type: 'dynamic',
  mass: 5
})
const collider = app.create('collider', {
  type: 'box',
  size: [1, 1, 1]
})
body.add(collider)
body.add(mesh)
app.add(body)
```

### RigidBody Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.type` | String | `'static'` | `'static'`, `'kinematic'`, `'dynamic'` |
| `.mass` | Number | `1` | Mass for dynamic |
| `.linearDamping` | Number | - | Linear velocity damping |
| `.angularDamping` | Number | - | Angular velocity damping |

---

## Collider

Physics collision shape attached to RigidBody.

### Collider Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `.type` | String | - | `'box'`, `'sphere'`, `'geometry'` |
| `.size` | Array | - | Dimensions for box/sphere |
| `.trigger` | Boolean | `false` | Trigger volume |
| `.convex` | Boolean | - | Convex hull for geometry |

---

## LOD

Level-of-detail switching based on camera distance.

```javascript
const lod = app.create('lod')
lod.add(highDetailMesh) // Closest
lod.add(mediumDetailMesh)
lod.add(lowDetailMesh) // Furthest
app.add(lod)
```

---

## Mesh / SkinnedMesh

Geometry from loaded models. Access via `app.get(nodeId)`.

```javascript
const mesh = app.get('MyMesh')
mesh.material.color = 'red'
```

### Material Properties

| Property | Type | Description |
|----------|------|-------------|
| `.color` | String | Base color |
| `.emissive` | String | Glow color |
| `.emissiveIntensity` | Number | Glow strength |
| `.metalness` | Number | Metal look (0-1) |
| `.roughness` | Number | Surface roughness (0-1) |
| `.opacity` | Number | Transparency (0-1) |
