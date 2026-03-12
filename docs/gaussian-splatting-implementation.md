# Gaussian Splatting Implementation Status

## Overview

Integration of 3D Gaussian Splatting into Hyperfy using [Spark.js](https://sparkjs.dev/) (v2.0.0-preview).

> **Spark.js 2.0 Migration Complete** (March 2026)
> - Upgraded from Spark.js 0.1.10 to 2.0.0-preview
> - THREE.js upgraded to r179+
> - postprocessing upgraded to 7.x
> - LOD is now global on SparkRenderer instead of per-SplatMesh

---

## Current Implementation Status

### Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Spark.js Integration | ✅ | Native Spark.js rendering via `SplatMesh` and `SparkRenderer` |
| Format Support | ✅ | PLY, SPLAT, KSPLAT, SPZ, SOGS/SOG, ZIP |
| LOD System | ✅ | Device-based LOD with `lodRenderScale` |
| Float16 Precision Fix | ✅ | SparkRenderer attached to camera |
| Drag & Drop | ✅ | Drop splat files into world |
| Splat Selection | ✅ | Left-click and right-click selection in edit mode |
| Raycasting | ✅ | On-demand WASM ellipsoid raycasting |
| Transform Persistence | ✅ | Rotation/position saved after edit |
| Ghost Splat Fix | ✅ | Async handle creation tracking |
| WebXR/VR | ✅ | Works with HTTPS |
| Color/Opacity | ✅ | Runtime adjustable via `recolor` and `opacity` |

### Not Yet Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Depth of Field | ❌ | `focalDistance`, `apertureAngle` available |
| Blur Effects | ❌ | `blurAmount`, `preBlurAmount` available |
| Min/Max Pixel Radius | ❌ | Quality/performance tuning |
| Spherical Harmonics Control | ❌ | `maxSh` (0-3) for quality levels |
| Loading Progress UI | ❌ | `onProgress` callback available |
| Dyno Effects | ❌ | Dynamic splat manipulation |
| Skeletal Animation | ❌ | `skinning` support in SplatMesh |
| Environment Maps | ❌ | `renderEnvMap()` for IBL |

---

## Device Performance Tiers

### LOD Settings
```javascript
// LOD scale: higher = more aggressive culling
const lodRenderScale = {
  desktop: 1.0,   // Full quality
  mobile: 5.0,    // Aggressive LOD
  quest: 6.0      // Very aggressive LOD for VR
}

// maxStdDev: limits Gaussian fall-off extent
const maxStdDev = {
  desktop: Math.sqrt(8),  // ~2.8 (default)
  mobile: 1.5,
  quest: 1.8,
  vr: Math.sqrt(5)        // ~2.24 (Spark.js recommendation)
}
```

### Splat Count Budgets (from Spark.js docs)
```javascript
const SPLAT_BUDGETS = {
  quest: 1_000_000,       // Quest 3 - avoid dense clustering
  android: 2_000_000,     // Android phones
  iphone: 3_000_000,      // iPhones
  desktop: 5_000_000,     // Standard desktop
  highEnd: 20_000_000     // High-end desktop GPUs
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/core/systems/Stage.js` | SparkRenderer setup, SplatMesh creation, raycasting |
| `src/core/nodes/GaussianSplat.js` | Node definition, properties, handle management |
| `src/core/systems/ClientBuilder.js` | Drag & drop, selection, inline splat script |
| `src/core/systems/ClientLoader.js` | Splat file loading and caching |
| `src/core/utils/splatFormats.js` | Shared format detection utilities |
| `src/core/utils/sparkCache.js` | Cached Spark.js import singleton |

---

## Architecture

### SparkRenderer Setup (Stage.js)

```javascript
// Create SparkRenderer and attach to camera for float16 precision
sparkRendererInstance = new SparkRenderer({
  renderer: this.world.graphics.renderer
})
this.world.camera.add(sparkRendererInstance)

// Adjust maxStdDev for device
if (tier === 'quest') sparkRendererInstance.maxStdDev = 1.8
else if (tier === 'mobile') sparkRendererInstance.maxStdDev = 1.5
```

### SplatMesh Creation

```javascript
// For SPZ/PLY/SPLAT/KSPLAT - use loader
const splatData = await this.world.loader.load('splat', srcUrl)
const splatMesh = await splatData.createSplatMesh()

// For SOGS/ZIP - use URL directly (Spark.js handles decompression)
const splatMesh = new SplatMesh({
  url: actualUrl,
  fileType: 'pcsogs',
  lodRenderScale: lodRenderScale
})
```

### Raycasting (On-Demand)

```javascript
// Don't raycast splats every frame - only on click!
raycastSplatsOnDemand(raycaster) {
  for (const [id, splatMesh] of this.splatMeshes) {
    const splatHits = []
    // Uses Spark's WASM with RAYCAST_ELLIPSOID=true
    splatMesh.raycast(raycaster, splatHits)
    // ...
  }
}
```

### Ghost Splat Prevention (GaussianSplat.js)

```javascript
// Track creation attempts to prevent stale handles
const creationId = ++this.handleCreationId
const newHandle = await this.ctx.world.stage.insertGaussianSplat({...})

// Check if invalidated while waiting
if (creationId !== this.handleCreationId) {
  newHandle?.destroy()  // Stale - destroy immediately
  return
}
this.handle = newHandle
```

---

## Spark.js API Reference

### SparkRenderer Options (Full)

| Parameter | Purpose | Default | Used |
|-----------|---------|---------|------|
| `renderer` | THREE.WebGLRenderer instance | required | ✅ |
| `clock` | THREE.Clock for time sync | `new THREE.Clock` | ❌ |
| `autoUpdate` | Auto-update splats each frame | `true` | ✅ (default) |
| `preUpdate` | Update before/after render (false for WebXR) | `false` | ✅ (default) |
| `originDistance` | Distance triggering origin update | `1.0` | ❌ |
| `maxStdDev` | Max Gaussian standard deviations | `Math.sqrt(8)` | ✅ |
| `minPixelRadius` | Minimum splat pixel size | `0.0` | ❌ |
| `maxPixelRadius` | Maximum splat pixel size | `512.0` | ❌ |
| `minAlpha` | Minimum alpha for rendering | `0.5/255` | ❌ |
| `enable2DGS` | 2D Gaussian splatting mode | `false` | ❌ |
| `preBlurAmount` | Pre-render covariance blur | `0.0` | ❌ |
| `blurAmount` | Blur with opacity adjustment | `0.3` | ❌ |
| `focalDistance` | DOF focal plane distance | `0.0` | ❌ |
| `apertureAngle` | DOF aperture (radians) | `0.0` | ❌ |
| `falloff` | Gaussian kernel falloff (0-1) | `1.0` | ❌ |
| `clipXY` | View frustum clip boundary | `1.4` | ❌ |
| `focalAdjustment` | Projected splat scale adjust | `1.0` | ❌ |

### SparkRenderer Methods

| Method | Purpose | Used |
|--------|---------|------|
| `newViewpoint(options)` | Create additional viewpoints | ❌ |
| `update({ scene })` | Manual scene update | ❌ |
| `renderEnvMap({ renderer, scene, worldCenter })` | Generate environment maps | ❌ |
| `recurseSetEnvMap(root, envMap)` | Apply envMap to materials | ❌ |
| `getRgba({ generator })` | Extract RGBA from splats | ❌ |
| `readRgba({ generator })` | Read RGBA to CPU | ❌ |

### SplatMesh Options (Full)

| Parameter | Purpose | Default | Used |
|-----------|---------|---------|------|
| `url` | Fetch file from URL | — | ✅ |
| `fileBytes` | Raw bytes for decoding | — | ✅ |
| `fileType` | Override format detection | — | ✅ |
| `packedSplats` | Use existing PackedSplats | — | ❌ |
| `maxSplats` | Reserve splat capacity | — | ❌ |
| `constructSplats` | Programmatic creation | — | ❌ |
| `onLoad` | Load complete callback | — | ✅ |
| `onFrame` | Frame update callback | — | ❌ |
| `objectModifier` | Object-space modifications | — | ❌ |
| `worldModifier` | World-space modifications | — | ❌ |
| `editable` | Enable SplatEdits | `true` | ❌ |
| `lodRenderScale` | LOD aggressiveness | `1.0` | ✅ |

### SplatMesh Properties

| Property | Purpose | Used |
|----------|---------|------|
| `recolor` | THREE.Color tint | ✅ |
| `opacity` | Global opacity (0-1) | ✅ |
| `position/quaternion/rotation` | Transforms | ✅ |
| `scale` | Uniform scale only | ✅ |
| `initialized` | Promise for init complete | ❌ |
| `isInitialized` | Boolean init status | ✅ |
| `numSplats` | Current splat count | ✅ |
| `skinning` | Skeletal animation | ❌ |
| `edits` | SplatEdit list | ❌ |
| `splatRgba` | Custom RGBA overrides | ❌ |
| `maxSh` | Spherical Harmonics level (0-3) | ❌ |
| `context` | SplatMeshContext with dyno | ❌ |

### SplatMesh Methods

| Method | Purpose | Used |
|--------|---------|------|
| `dispose()` | Free resources | ✅ |
| `pushSplat(...)` | Add new splat | ❌ |
| `forEachSplat(callback)` | Iterate splats | ❌ |
| `getBoundingBox(centers_only)` | Get AABB | ❌ |
| `updateGenerator()` | Recompile pipeline | ❌ |
| `update()` | Manual update | ❌ |
| `raycast(raycaster, intersects)` | Ray intersection | ✅ |

---

## Dyno System (Not Yet Used)

Dyno is Spark's shader-like system for dynamic splat manipulation.

### Capabilities
- **Transforms**: Position/rotation/scale modifications
- **Color Animation**: Dynamic color cycling
- **DynoUniform**: Runtime adjustable values without recompilation
- **Procedural Generation**: `constructSplats` for programmatic creation
- **Gsplat Struct**: Access center, scales, quaternion, RGBA per splat

### Potential Use Cases
```javascript
// Example: Pulsing opacity effect
const pulseUniform = new DynoUniform({ value: 1.0 })

splatMesh.objectModifier = (gsplat) => {
  return dyno.modifyOpacity(gsplat, dyno.mul(gsplat.opacity, pulseUniform))
}

// Update in animation loop
pulseUniform.value = 0.5 + 0.5 * Math.sin(time * 2)
```

---

## WebXR/VR Notes

### Requirements
- **HTTPS required** for WebXR to work
- `preUpdate: false` for SparkRenderer (default, don't change)
- Lower `maxStdDev` for VR performance (Math.sqrt(5) recommended)

### Quest 3 Budget
- 1 million splats or less
- Avoid too many splats concentrated in small area

### Performance Tips
- Set `antialias: false` on WebGLRenderer (splats don't benefit)
- Consider lower `devicePixelRatio` for splat-heavy scenes
- Use `minAlpha` to reduce overdraw

---

## Known Issues / TODO

### Code Quality Issues (Phase 1 & 2 Done)
- [x] ~~Massive code duplication in Stage.js `insertGaussianSplat`~~ → Refactored
- [x] ~~Unnecessary THREE re-imports inside async functions~~ → Removed
- [x] ~~`sortMode` parameter passed but never used~~ → Removed
- [x] ~~SOGS interval not cleaned up on destroy~~ → Fixed
- [x] Format detection duplicated across 4 files → Centralized in `src/core/utils/splatFormats.js
- [ ] Inline script as 180-line string in ClientBuilder.js

### Splat Orientation
- 180° X-axis flip is applied **internally** in `_setupSplatMesh()` via `SPLAT_FLIP_QUATERNION`
- User's app.rotation stays at their actual desired rotation (0° by default)
- No need for autoRotate toggle - correction happens automatically

### Feature Gaps
- [ ] No loading progress UI (onProgress available)
- [ ] No DOF/blur effects (available in SparkRenderer)
- [ ] No Spherical Harmonics control (maxSh)
- [ ] No Dyno effects integration
- [ ] No skeletal animation (skinning)

See `gaussian-splatting-todo.md` for detailed refactoring plan.

---

## Spark.js Resources

### Documentation
- **Homepage**: https://sparkjs.dev/
- **Overview**: https://sparkjs.dev/docs/overview/
- **SparkRenderer**: https://sparkjs.dev/docs/spark-renderer/
- **SplatMesh**: https://sparkjs.dev/docs/splat-mesh/
- **Performance Tuning**: https://sparkjs.dev/docs/performance/
- **Dyno Stdlib**: https://sparkjs.dev/docs/dyno-stdlib/
- **System Design**: https://sparkjs.dev/docs/system-design/

### GitHub
- **Repository**: https://github.com/sparkjsdev/spark
- **Examples**: https://github.com/sparkjsdev/spark/tree/main/examples
- **WebXR Example**: https://github.com/sparkjsdev/spark/tree/main/examples/webxr

### Key Spark.js Features Used
- `SplatMesh` - Main splat rendering object
- `SparkRenderer` - Manages sorting and rendering
- `lodRenderScale` - LOD control property
- `recolor` - Tint color (Vector3: r, g, b)
- `opacity` - Transparency control
- `raycast()` - WASM-based ellipsoid raycasting

---

## Recent Commits

```
17ae7df feat: add splat selection and fix rotation persistence
f809597 feat: add splat raycasting and fix ghost splat bug
511f522 refactor: simplify splat loading to use Spark.js native handling
7aac9b5 feat: add streaming PLY loader with progressive rendering
abc4bb8 perf: add device-based LOD settings for mobile/Quest
6ad13f6 fix: attach SparkRenderer to camera for float16 precision
202200b feat: implement LOD system for Gaussian Splatting with Spark 0.1.10
```

---

## Inline Splat Script (Drag & Drop)

When a splat file is dropped, an inline script is generated with:
- File input configuration
- Sort mode selection (auto/distance/none)
- Show cube handle toggle
- Auto-rotate toggle (180° X-axis flip)
- Color and opacity controls

The auto-rotate only applies on first load to preserve user rotations:
```javascript
const hasExistingRotation = Math.abs(app.rotation.x) > 0.01 ||
                            Math.abs(app.rotation.y) > 0.01 ||
                            Math.abs(app.rotation.z) > 0.01
if (props.autoRotate !== false && !hasExistingRotation) {
  app.rotation.x = Math.PI
}
```

---

*Last updated: January 2026*
