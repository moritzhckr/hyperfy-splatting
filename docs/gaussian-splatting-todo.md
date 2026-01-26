# Gaussian Splatting Refactoring TODO

## Overview

This document tracks code improvements and new features for the Gaussian Splatting implementation.

---

## Workflow

### Branch
- **Branch:** `refactor/gaussian-splatting`
- **Base:** `feature/gaussian-splatting`

### Rules
1. **Commit after each task** - Small, atomic commits
2. **Test after each phase** - Verify splats still work
3. **Update docs** - Keep implementation.md in sync

### Testing Checklist
After each phase, verify:
- [ ] Drag & drop PLY file works
- [ ] Drag & drop SPZ file works
- [ ] Drag & drop SOGS/ZIP file works
- [ ] Color/opacity changes work
- [ ] Selection (left-click) works
- [ ] Inspect (right-click) works
- [ ] Transform persistence works (move, save, reload)

---

## URGENT: Known Bugs

### 180° Rotation Bug ✅
**Status:** FIXED

**Solution implemented:**
- Added `SPLAT_FLIP_QUATERNION` (180° X-axis) in Stage.js
- `_setupSplatMesh()` now decomposes matrix, applies flip, recomposes
- `move()` in handle also applies the flip
- Removed `autoRotate` toggle from inline script (no longer needed)
- App rotation stays at user's actual rotation (0° by default)

**Commits:** (pending)

### Missing Keyboard Shortcuts ✅
- [x] Add **Delete/Backspace** key to delete selected splat (like 3D models)
- [x] **Duplicate** already works with **R** key (D is reserved for WASD movement)

**Note:** Current R duplicates mesh within same app, not creating a new app instance.
Consider: `Shift+R` = duplicate as new app, `R` = duplicate mesh only?

**Files:** `src/core/systems/ClientBuilder.js`

---

## Phase 1: Critical Code Smells (High Priority)

### 1.1 Extract Duplicated Code in Stage.js ✅
- [x] Create `_createSplatHandle()` helper function
- [x] Create `_setupSplatMesh()` helper function
- [x] Unify SPZ/SOGS/Other format handling into single code path
- [x] Extract common handle methods (move, updateColor, updateOpacity, destroy)
- [x] Remove ~200 lines of duplicated code (370 → 170 lines)

**Commit:** `cd86423`

### 1.2 Remove Unnecessary THREE.js Re-imports ✅
- [x] Remove `await import('three')` calls inside `insertGaussianSplat`
- [x] Use already imported THREE from line 1

**Commit:** `cd86423` (combined with 1.1)

### 1.3 Fix sortMode Parameter ✅
- [x] Check if Spark.js SplatMesh supports sortMode → **NOT SUPPORTED**
- [x] Remove sortMode from insertGaussianSplat call
- [x] Add deprecation comments (kept for backwards compatibility)
- [x] Remove unused pendingHandle property

**Commit:** `f56cbef`

---

## Phase 2: Architecture Improvements (Medium Priority)

### 2.1 Create Shared Format Detection Utility
- [ ] Create `src/core/utils/splatFormats.js`
- [ ] Export `detectSplatFormat(filename)` function
- [ ] Export `SPLAT_FORMATS` constant with all supported extensions
- [ ] Replace duplicated format detection in all files

**Files to update:**
- `src/core/systems/Stage.js`
- `src/core/nodes/GaussianSplat.js`
- `src/core/systems/ClientBuilder.js`
- `src/core/systems/ClientLoader.js`

### 2.2 Cache Spark.js Import
- [ ] Create singleton pattern for Spark.js import
- [ ] Import once in Stage.js, expose via world or stage
- [ ] Remove repeated dynamic imports in ClientLoader.js

### 2.3 Fix SOGS Loading Interval Cleanup
- [ ] Store interval ID on handle or mesh
- [ ] Clear interval in destroy() method
- [ ] Add cleanup in Stage.destroy()

**File:** `src/core/systems/Stage.js:539-549`

### 2.4 Fix PRECISION_SCALE Inconsistency
- [ ] Decide: apply PRECISION_SCALE or not?
- [ ] Make consistent between `load()` and `insert()` methods
- [ ] Document why 10x scale is needed (or remove if not)

**File:** `src/core/systems/ClientLoader.js:585, 625`

---

## Phase 3: Memory & Cleanup (Medium Priority)

### 3.1 Fix Blob URL Memory Leak
- [ ] Track all created blob URLs in ClientLoader
- [ ] Call `URL.revokeObjectURL()` in `remove()` method
- [ ] Ensure cleanup on splat destroy

**File:** `src/core/systems/ClientLoader.js:570`

### 3.2 Remove Unused pendingHandle
- [ ] Remove `this.pendingHandle` from GaussianSplat.js
- [ ] Or implement proper pending handle tracking if needed

**File:** `src/core/nodes/GaussianSplat.js:36, 69-70`

### 3.3 Remove Empty Code Blocks
- [ ] Remove empty `if (ext === 'zip')` block
- [ ] Add implementation or remove entirely

**File:** `src/core/systems/ClientBuilder.js:1102-1104`

---

## Phase 4: New Spark.js Features (Enhancement)

### 4.1 SparkRenderer Enhancements
- [ ] Add `minPixelRadius` / `maxPixelRadius` controls
- [ ] Add `minAlpha` for overdraw reduction
- [ ] Implement depth-of-field: `focalDistance`, `apertureAngle`
- [ ] Add `blurAmount` for visual effects
- [ ] Consider `enable2DGS` mode support

**New Properties to expose:**
```javascript
sparkRendererInstance.minPixelRadius = 0.0    // Min splat size
sparkRendererInstance.maxPixelRadius = 512.0  // Max splat size
sparkRendererInstance.minAlpha = 0.5/255      // Alpha cutoff
sparkRendererInstance.focalDistance = 10.0    // DOF focal plane
sparkRendererInstance.apertureAngle = 0.01    // DOF aperture
sparkRendererInstance.blurAmount = 0.3        // Gaussian blur
```

### 4.2 SplatMesh Enhancements
- [ ] Add `onProgress` callback for loading progress UI
- [ ] Expose `maxSh` (Spherical Harmonics level) control
- [ ] Add `getBoundingBox()` for better culling
- [ ] Consider `skinning` support for animated splats
- [ ] Add `edits` / `SplatEdit` support for runtime modifications

**New Properties to expose:**
```javascript
splatMesh.maxSh = 3              // SH level (0-3)
splatMesh.editable = true       // Enable runtime edits
// splatMesh.skinning = ...     // Future: skeletal animation
```

### 4.3 Dyno System Integration
- [ ] Research Dyno for dynamic splat manipulation
- [ ] Implement basic Dyno effects (color animation, pulsing)
- [ ] Add DynoUniform for runtime adjustments
- [ ] Consider procedural splat generation with `constructSplats`

**Potential use cases:**
- Animated color cycling
- Pulsing/breathing effects
- Procedural splat generation
- Runtime splat modification

### 4.4 Performance Optimizations
- [ ] Verify `antialias: false` on WebGLRenderer
- [ ] Add device-specific splat budgets (not just LOD)
- [ ] Implement splat count warnings based on device
- [ ] Consider pixel ratio adjustment for splat-heavy scenes

**Device budgets:**
```javascript
const SPLAT_BUDGETS = {
  quest: 1_000_000,
  mobile: 2_000_000,
  desktop: 5_000_000,
  highEnd: 20_000_000
}
```

---

## Phase 5: Code Quality (Low Priority)

### 5.1 Extract Inline Script to Template
- [ ] Move inline splat script from ClientBuilder.js to separate file
- [ ] Create `src/core/templates/gaussianSplatApp.js`
- [ ] Load template and replace placeholders at runtime

**File:** `src/core/systems/ClientBuilder.js:1124-1306`

### 5.2 Standardize Error Handling
- [ ] Create consistent error handling pattern
- [ ] Decide: console.warn vs console.error
- [ ] Add error codes/types for splat errors

### 5.3 Add TypeScript Types (Future)
- [ ] Create type definitions for splat-related interfaces
- [ ] Document all public APIs

---

## Phase 6: Documentation Updates

### 6.1 Update Implementation Doc
- [x] Add new Spark.js features discovered
- [x] Update SparkRenderer options table
- [x] Update SplatMesh options table
- [x] Add Dyno section
- [ ] Add architecture diagram

### 6.2 Create API Reference
- [ ] Document all public splat APIs
- [ ] Add code examples
- [ ] Document device-specific recommendations

---

## Progress Tracking

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Critical | ✅ Done | 3/3 |
| Phase 2: Architecture | ⏳ Pending | 0/4 |
| Phase 3: Memory | ⏳ Pending | 0/3 |
| Phase 4: Features | ⏳ Pending | 0/4 |
| Phase 5: Quality | ⏳ Pending | 0/3 |
| Phase 6: Docs | ✅ Done | 2/2 |

---

## Commit History

| Commit | Phase | Description |
|--------|-------|-------------|
| `7fecc99` | 6 | docs: add refactoring plan and update implementation docs |
| `cd86423` | 1.1+1.2 | refactor: extract duplicated splat handle code (-208 lines) |
| `f56cbef` | 1.3 | fix: remove unused sortMode parameter and pendingHandle |

---

## Implementation Notes

### Why PRECISION_SCALE exists
Float16 precision issues cause visual artifacts (line patterns) when splat positions have small values. Scaling up by 10x moves values into a range with better precision.

### SparkRenderer attachment to camera
Attaching SparkRenderer to camera (not scene) fixes float16 quantization artifacts by keeping position values relative to camera origin.

### SOGS/ZIP vs other formats
SOGS/ZIP files need URL-based loading because Spark.js handles decompression internally. Other formats can use `fileBytes` directly.

---

*Last updated: January 2026*
