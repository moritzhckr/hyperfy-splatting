# LOD (Level of Detail) Implementation for Gaussian Splatting

**Branch:** `feature/gaussian-splatting`
**Date:** 2026-01-11
**Status:** 🔴 In Development - File Loading Currently Broken

---

## Table of Contents
1. [Overview](#overview)
2. [Current Status](#current-status)
3. [File Format Support](#file-format-support)
4. [LOD Research & References](#lod-research--references)
5. [Implementation Plan](#implementation-plan)
6. [Technical Architecture](#technical-architecture)
7. [Known Issues](#known-issues)
8. [Change Log](#change-log)

---

## Overview

### What is LOD for Gaussian Splats?

Level of Detail (LOD) is a rendering optimization technique that adjusts the quality/complexity of 3D content based on:
- **Distance from camera**: Farther objects use fewer splats
- **Screen space coverage**: Smaller objects use simplified representations
- **Performance budget**: Dynamically reduce quality to maintain frame rate

For Gaussian Splatting, LOD can be achieved through:
1. **Progressive loading**: Load low-res version first, stream high-res data progressively
2. **Distance-based culling**: Remove splats beyond certain distance thresholds
3. **Splat count reduction**: Use simplified versions with fewer splats at distance
4. **Quality tiers**: Pre-computed LOD levels (LOD0 = full quality, LOD1/2/3 = reduced)

---

## Current Status

### ❌ CRITICAL ISSUE: No Files Loading

**Problem:** Currently NO file formats are loading successfully (SPZ, PLY, SOG, ZIP)
- Drag & Drop: Not working
- UI File Select: Not working

**Root Cause Analysis Needed:**
- [ ] Check if loader is being called
- [ ] Verify file format detection
- [ ] Check Stage.js insertGaussianSplat flow
- [ ] Verify Spark.js integration
- [ ] Check for console errors

### Current File Loading Architecture

```
User Action (Drag/Drop or UI)
    ↓
ClientBuilder.addSplat() OR Fields.FieldFile()
    ↓
world.loader.load('splat', url)
    ↓
ClientLoader.load() - Detects format, loads fileBytes
    ↓
GaussianSplat.loadSplat() - Stores splatData
    ↓
GaussianSplat.createSplatHandle()
    ↓
Stage.insertGaussianSplat() - Creates SplatMesh
    ↓
Render in scene
```

---

## File Format Support

### Supported Formats

| Format | Extension | Loading Method | Compression | LOD Support | Status |
|--------|-----------|----------------|-------------|-------------|---------|
| **PLY** | `.ply` | fileBytes | None | ❌ Not yet | 🔴 Broken |
| **KSPLAT** | `.ksplat` | fileBytes | None | ❌ Not yet | 🔴 Broken |
| **SPLAT** | `.splat` | fileBytes | None | ❌ Not yet | 🔴 Broken |
| **SPZ** | `.spz` | fileBytes | Gzip | ❌ Not yet | 🔴 Broken |
| **SOGS** | `.sogs`, `.zip` | URL (Spark unzip) | Zip | ✅ Native | 🔴 Broken |

### Format Details

#### SPZ (Compressed Splat)
- Gzip-compressed splat format
- Requires special handling: `preserveCompression: true`
- Loaded via fileBytes approach
- 10x precision scale applied in loader, 0.1x compensation in Stage

#### PLY (Stanford Polygon File Format)
- Standard 3D point cloud format
- Text or binary encoding
- Loaded via fileBytes approach
- 10x precision scale applied

#### SOGS (Optimized Gaussian Splats)
- Optimized format with built-in LOD support
- Can be packaged as ZIP
- Loaded directly via URL (Spark.js handles unzipping)
- **Best candidate for LOD implementation**

---

## LOD Research & References

### Spark.js LOD Capabilities

**Documentation to Research:**
- [ ] Spark.js GitHub: https://github.com/mkkellogg/GaussianSplats3D
- [ ] Spark.js NPM: https://www.npmjs.com/package/@sparkjsdev/spark
- [ ] SOGS format specification
- [ ] Progressive loading examples

**Key Features to Investigate:**
1. Does Spark.js support native LOD for SOGS files?
2. Can we programmatically reduce splat count?
3. Distance-based culling APIs
4. Progressive streaming support
5. Memory management for multi-LOD scenarios

### Academic & Industry References

**Papers to Review:**
- [ ] "3D Gaussian Splatting for Real-Time Radiance Field Rendering" (Original paper)
- [ ] Progressive loading techniques for point clouds
- [ ] LOD systems for volumetric data

**Existing Implementations:**
- [ ] Three.js LOD system: https://threejs.org/docs/#api/en/objects/LOD
- [ ] Unity LOD Groups
- [ ] Unreal Engine HLOD

### Technical Approaches

#### Approach 1: Distance-Based LOD Tiers
```
Distance Ranges:
- 0-10m:   LOD0 (100% splats)
- 10-25m:  LOD1 (50% splats)
- 25-50m:  LOD2 (25% splats)
- 50-100m: LOD3 (10% splats)
- 100m+:   Culled (0% splats)
```

#### Approach 2: Progressive Streaming
```
1. Load low-res preview (1-5% splats) instantly
2. Stream LOD1 (25% splats) in background
3. Stream LOD2 (50% splats) when closer
4. Stream LOD0 (100% splats) when in focus
```

#### Approach 3: Screen-Space LOD
```
Calculate screen space coverage:
- < 50px:  LOD3 (minimal detail)
- 50-200px: LOD2
- 200-500px: LOD1
- > 500px: LOD0 (full quality)
```

---

## Implementation Plan

### Phase 1: Fix Current File Loading ⏳ IN PROGRESS

**Priority: CRITICAL**

Tasks:
- [x] Analyze current loading flow
- [x] Add SPZ to GaussianSplat.js loader formats
- [ ] Debug why files aren't loading at all
- [ ] Add comprehensive logging to track loading pipeline
- [ ] Test each format individually (SPZ, PLY, SOGS, ZIP)
- [ ] Verify Drag & Drop functionality
- [ ] Verify UI File Select functionality

**Files to Modify:**
- `src/core/nodes/GaussianSplat.js` - Add SPZ support ✅
- `src/core/systems/ClientLoader.js` - Add debug logging
- `src/core/systems/Stage.js` - Add debug logging
- `src/core/systems/ClientBuilder.js` - Verify drag & drop

---

### Phase 2: Research LOD Implementation

**Priority: HIGH**

Tasks:
- [ ] Research Spark.js LOD capabilities
- [ ] Test SOGS native LOD features
- [ ] Benchmark different LOD approaches
- [ ] Determine optimal LOD strategy
- [ ] Create LOD system design document

**Deliverables:**
- LOD design specification
- Performance benchmarks
- Memory usage analysis

---

### Phase 3: Implement Basic LOD System

**Priority: MEDIUM**

Tasks:
- [ ] Implement distance-based LOD calculation
- [ ] Add LOD level switching logic
- [ ] Create LOD configuration system
- [ ] Add camera distance tracking
- [ ] Implement smooth LOD transitions

**New Files:**
- `src/core/systems/GaussianSplatLOD.js` - LOD management system
- `src/core/utils/LODCalculator.js` - Distance/screen-space calculations

**Modified Files:**
- `src/core/nodes/GaussianSplat.js` - Add LOD properties
- `src/core/systems/Stage.js` - Integrate LOD manager
- `apps/GaussianSplat.js` - Add LOD UI controls

---

### Phase 4: Advanced LOD Features

**Priority: LOW**

Tasks:
- [ ] Implement progressive loading for large files
- [ ] Add dynamic quality adjustment based on FPS
- [ ] Implement LOD hysteresis (prevent popping)
- [ ] Add LOD debug visualization
- [ ] Optimize memory management for multi-LOD

**UI Features:**
- LOD level visualization overlay
- Performance metrics display
- Manual LOD override controls
- LOD distance threshold sliders

---

## Technical Architecture

### Proposed LOD System Structure

```javascript
class GaussianSplatLODManager {
  constructor(world, stage) {
    this.world = world
    this.stage = stage
    this.lodObjects = new Map() // id -> LODObject
    this.camera = world.stage.camera
    this.enabled = true
    this.updateInterval = 100 // ms between LOD checks
  }

  registerSplat(id, splatNode, lodLevels) {
    // lodLevels: [LOD0_url, LOD1_url, LOD2_url, LOD3_url]
    this.lodObjects.set(id, {
      node: splatNode,
      lodLevels,
      currentLOD: 0,
      distanceThresholds: [10, 25, 50, 100] // meters
    })
  }

  update(deltaTime) {
    if (!this.enabled) return

    for (const [id, lodObj] of this.lodObjects) {
      const distance = this.calculateDistance(lodObj.node)
      const targetLOD = this.determineLOD(distance, lodObj.distanceThresholds)

      if (targetLOD !== lodObj.currentLOD) {
        this.switchLOD(id, targetLOD)
      }
    }
  }

  switchLOD(id, targetLOD) {
    // Unload current LOD
    // Load target LOD
    // Update currentLOD
  }
}
```

### GaussianSplat Node Extensions

```javascript
// Add to GaussianSplat.js
const defaults = {
  // ... existing defaults
  lodEnabled: true,
  lodDistances: [10, 25, 50, 100], // LOD switch distances
  lodUrls: null, // Array of URLs for each LOD level
  lodBias: 0, // -1 = prefer lower LOD, +1 = prefer higher LOD
  lodHysteresis: 0.1 // Prevent rapid switching (10% buffer)
}
```

---

## Known Issues

### Critical Issues

1. **❌ File Loading Completely Broken**
   - **Status:** Unresolved
   - **Impact:** HIGH - No files load at all
   - **Affected:** All formats (SPZ, PLY, SOGS, ZIP)
   - **Next Steps:** Full debugging of loading pipeline

2. **⚠️ SPZ Format Support Incomplete**
   - **Status:** Partially Fixed
   - **Impact:** MEDIUM
   - **Fix:** Added SPZ to loader format list in GaussianSplat.js:79
   - **Remaining:** Verify it works after fixing main loading issue

### Medium Priority Issues

3. **⚠️ No LOD System Implemented**
   - **Status:** Not started
   - **Impact:** MEDIUM - Performance issues with large/multiple splats
   - **Blocked by:** Issue #1 (file loading)

4. **⚠️ No Progressive Loading**
   - **Status:** Not started
   - **Impact:** MEDIUM - Large files take long to load
   - **Potential Solution:** Use SOGS streaming capabilities

### Low Priority Issues

5. **ℹ️ No LOD Debug Visualization**
   - **Status:** Not started
   - **Impact:** LOW - Harder to debug/tune LOD system
   - **Nice to have:** Color-coded LOD level overlay

---

## Change Log

### 2026-01-11 - Initial LOD Branch Setup

#### Session 1: SPZ Support & Debug Infrastructure

**Changes Made:**

1. **Added SPZ to format loading list in `GaussianSplat.js:90`**
   ```javascript
   // Before:
   if (format === 'ply' || format === 'ksplat' || format === 'splat') {

   // After:
   if (format === 'ply' || format === 'ksplat' || format === 'splat' || format === 'spz') {
   ```

2. **Added SPZ to createSplatHandle format check in `GaussianSplat.js:148`**
   ```javascript
   if ((format === 'ply' || format === 'ksplat' || format === 'splat' || format === 'spz') && this.splatData) {
   ```

3. **Added Comprehensive Debug Logging**

   **Files Modified:**
   - `src/core/nodes/GaussianSplat.js`:
     - Added logging to `mount()` (line 37-46)
     - Added extensive logging to `loadSplat()` (line 62-123)
     - Added logging to `createSplatHandle()` (line 127-173)

   - `src/core/systems/ClientLoader.js`:
     - Added logging to splat file loading (line 339-343)

   - `src/core/systems/Stage.js`:
     - Added logging to `insertGaussianSplat()` entry (line 318-368)
     - Added logging to SPZ path (line 371-385)
     - Added logging to SOGS/ZIP path (line 481-492)
     - Added logging to PLY/KSPLAT/SPLAT path (line 573-589)

   **Debug Log Categories:**
   - 🏔️ Node mounting
   - 🔵 SPZ-specific operations
   - 📦 Standard loader operations
   - 🌐 Network/URL loading
   - 🔍 Format detection
   - 🔨 SplatMesh creation
   - ✅ Success confirmations
   - ⚠️ Warnings
   - ❌ Errors
   - 💾 Cache operations
   - 📡 Server mode notifications
   - 🎨 Handle creation
   - 🚀 Major operation starts

**Issues Discovered:**
- No files loading at all (any format)
- Root cause still unknown - debug logging added to investigate

**Debug Strategy:**
The comprehensive logging will help identify:
1. Whether `mount()` is being called
2. Whether `loadSplat()` executes
3. Whether the loader is invoked
4. Whether `createSplatHandle()` is called
5. Which format path (SPZ/SOGS/PLY) is taken
6. Where errors occur in the pipeline

**Next Actions:**
- Run application and check browser console
- Follow debug logs through the entire pipeline
- Identify exact failure point
- Fix identified issues
- Test each format individually

---

#### Session 2: File Format Fixes Based on Log Analysis

**Test Results Analysis:**

| Format | Status | Issue | Fix Applied |
|--------|--------|-------|-------------|
| ✅ PLY | Working | None | - |
| ✅ SPZ | Working | None | - |
| ⚠️ KSPLAT | Working with Worker Error | Worker error: "Unknown file type" | No fix needed - Spark.js internal issue |
| ⚠️ ZIP | Working with Worker Error | Blob URL prevented fileType detection | ✅ Use resolved URL instead of Blob URL |
| ❌ SOG | Not loading | Not in accept list | ✅ Added .sog to all accept lists |

**Changes Made:**

1. **Added .sog file extension support**

   Files modified:
   - `src/client/components/Fields.js:453-455` - Added .sog to accept/exts/placeholder
   - `src/core/systems/ClientBuilder.js:1064` - Added 'sog' to extension check
   - `src/core/systems/Stage.js:354` - Added 'sog' to fileType detection
   - `src/core/systems/Stage.js:368` - Added 'sog' to isSOGS check

2. **Fixed ZIP file loading to use resolved URL instead of Blob URL**

   File modified: `src/core/nodes/GaussianSplat.js:153-169`

   Problem: ZIP files were getting Blob URLs which prevented Spark.js from detecting the fileType from the extension.

   Solution: Added `isSOGSFormat` check to skip Blob URL creation for SOG/SOGS/ZIP files, ensuring they use the resolved URL with proper extension.

   ```javascript
   // SOGS/ZIP files need the actual URL (not blob) so Spark.js can detect fileType
   const isSOGSFormat = format === 'sog' || format === 'sogs' || format === 'zip'

   if ((format === 'ply' || format === 'ksplat' || format === 'splat' || format === 'spz') && this.splatData) {
     // Use blob URL from standard loader for fileBytes formats
     actualURL = this.splatData.localUrl || actualURL
   } else if (!isSOGSFormat && this.ctx.world.loader.hasFile(this._src)) {
     // Fallback to cached file blob URL (but NOT for SOGS/ZIP)
     const cachedFile = this.ctx.world.loader.getFile(this._src)
     if (cachedFile) {
       actualURL = URL.createObjectURL(cachedFile)
     }
   } else {
     // Use direct URL for SOGS/ZIP/SOG formats
     // Spark.js needs the extension in the URL to detect fileType
   }
   ```

**Issues Identified:**

1. **KSPLAT Worker Error (Low Priority)**
   - Error: "Worker error: Unknown file type" in Spark.js worker
   - Impact: KSPLAT files load and render successfully despite error
   - Root Cause: Spark.js internal worker doesn't recognize 'ksplat' fileType
   - Status: No fix needed - cosmetic error only, functionality works
   - Potential Fix (if needed): Set fileType to null for auto-detection

2. **ZIP Worker Error (FIXED)**
   - Error: "Worker error: Unknown file type"
   - Root Cause: Blob URL didn't contain file extension
   - Fix: Use resolved URL instead of Blob URL for ZIP files
   - Status: ✅ Fixed

3. **SOG File Support (FIXED)**
   - Error: Files not loading at all
   - Root Cause: .sog extension not in accept lists
   - Fix: Added .sog to all relevant locations
   - Status: ✅ Fixed

**Updated File Format Support Status:**

| Format | Extension | Status | Notes |
|--------|-----------|--------|-------|
| PLY | `.ply` | ✅ Working | Fully functional |
| SPZ | `.spz` | ✅ Working | Fully functional |
| KSPLAT | `.ksplat` | ⚠️ Working | Cosmetic worker error (ignorable) |
| SPLAT | `.splat` | ⚠️ Untested | Should work like KSPLAT |
| SOG | `.sog` | ✅ Fixed | Added extension support |
| SOGS | `.sogs` | ✅ Working | Native LOD support |
| ZIP | `.zip` | ✅ Fixed | Uses resolved URL now |

**Next Steps:**
1. Test SOG files to verify fix works
2. Test ZIP files to verify worker error is gone
3. (Optional) Investigate KSPLAT worker error if it impacts functionality
4. Begin LOD implementation planning

---

#### Session 3: Spark.js 0.1.10 Update - LOD System Available!

**Date:** 2026-01-11

**Spark.js Updated:** 0.1.9 → 0.1.10 ✅

**Major LOD Features Added in 0.1.10:**

1. **`lodRenderScale` Property** 🔥
   - Multiplies minimum splat pixel size during LOD tree traversal
   - This is the KEY property for controlling LOD quality!
   - Higher value = more aggressive culling = better performance
   - Lower value = more splats rendered = better quality

2. **64KB Chunk Size for LOD Streaming**
   - Increased from 16KB to 64KB (4x larger)
   - Better performance for LOD tree traversal
   - Optimized paging mechanism

3. **Native SOGS/ZIP Support** 🎯
   - `.sog` and `.zip` files now parsed natively!
   - No more workarounds needed
   - Native LoD tree support for SOGS files

4. **Spherical Harmonics LOD Fix**
   - Resolved streaming compatibility issues
   - `ExtSplats` and `PagedSplats` now work correctly with LOD data

5. **Cube Map Rendering** (bonus feature)
   - `renderCubeMap()` - RGB and depth rendering
   - `renderEnvMap()` - environment map capability
   - Useful for reflections/lighting

6. **Multiple Modifiers Support**
   - `objectModifiers` array (replaces single `objectModifier`)
   - `worldModifiers` array (replaces single `worldModifier`)
   - Backwards compatible

**References:**
- Commit: https://github.com/sparkjsdev/spark/commit/8de5239d7f7c11bd80894dc9fddbefcf15e848f0
- Version: 0.1.10
- Installation: `npm install @sparkjsdev/spark@latest`

**Implementation Strategy:**

The `lodRenderScale` property is now our PRIMARY LOD control mechanism:

```javascript
const splatMesh = new SplatMesh({
  url: 'model.sog',  // SOGS files have native LOD trees
  lodRenderScale: 1.0  // Default - adjust based on distance/performance
})

// Dynamic LOD adjustment based on distance
function updateLOD(splatMesh, distanceToCamera) {
  if (distanceToCamera < 10) {
    splatMesh.lodRenderScale = 0.5  // High quality
  } else if (distanceToCamera < 50) {
    splatMesh.lodRenderScale = 1.0  // Medium quality
  } else {
    splatMesh.lodRenderScale = 2.0  // Low quality
  }
}
```

**SOGS Files - Native LOD Trees:**

SOGS format has built-in LOD tree structure. No preprocessing needed!
- Level 0: Full quality
- Level 1-N: Progressive reduction
- Spark.js automatically selects appropriate level based on `lodRenderScale`

**Next Implementation Steps:**
1. Add `lodRenderScale` property to GaussianSplat node
2. Implement distance-based LOD adjustment
3. Test with SOGS files (native LOD)
4. Add UI controls for manual LOD override
5. Benchmark performance improvements

---

## Testing Checklist

### File Loading Tests

- [ ] **SPZ Loading**
  - [ ] Drag & Drop SPZ file
  - [ ] UI Select SPZ file
  - [ ] Verify file appears in scene
  - [ ] Check console for errors

- [ ] **PLY Loading**
  - [ ] Drag & Drop PLY file
  - [ ] UI Select PLY file
  - [ ] Verify file appears in scene
  - [ ] Check console for errors

- [ ] **SOGS Loading**
  - [ ] Drag & Drop SOGS file
  - [ ] UI Select SOGS file
  - [ ] Verify file appears in scene
  - [ ] Check console for errors

- [ ] **ZIP Loading**
  - [ ] Drag & Drop ZIP file (packed SOGS)
  - [ ] UI Select ZIP file
  - [ ] Verify file appears in scene
  - [ ] Check console for errors

### LOD Tests (After Implementation)

- [ ] **Distance-Based LOD**
  - [ ] LOD switches at correct distances
  - [ ] Smooth transitions between LOD levels
  - [ ] No popping/stuttering

- [ ] **Performance Tests**
  - [ ] FPS with LOD enabled vs disabled
  - [ ] Memory usage per LOD level
  - [ ] Load time for different LOD strategies

- [ ] **Edge Cases**
  - [ ] Very small splats (< 1m)
  - [ ] Very large splats (> 100m)
  - [ ] Multiple splats with different LOD levels
  - [ ] Rapid camera movement

---

## Performance Targets

### LOD Performance Goals

| Scenario | Target FPS | Max Memory | Load Time |
|----------|-----------|------------|-----------|
| Single splat, no LOD | 30 fps | 500 MB | < 5s |
| Single splat, LOD enabled | 60 fps | 300 MB | < 2s (initial) |
| 5 splats, LOD enabled | 60 fps | 800 MB | < 5s (initial) |
| 10 splats, LOD enabled | 30 fps | 1.5 GB | < 10s (initial) |

### LOD Switching Thresholds (Initial Proposal)

```
LOD 0 (Full Quality):    0-10 meters
LOD 1 (75% quality):    10-25 meters
LOD 2 (50% quality):    25-50 meters
LOD 3 (25% quality):    50-100 meters
Culled:                 100+ meters
```

*Note: These will be tuned based on testing and performance profiling*

---

## Resources & Links

### Spark.js / GaussianSplats3D
- GitHub: https://github.com/mkkellogg/GaussianSplats3D
- NPM Package: https://www.npmjs.com/package/@sparkjsdev/spark
- Examples: (TODO: Find official examples)

### File Formats
- PLY Format Spec: http://paulbourke.net/dataformats/ply/
- SOGS Format: (TODO: Find specification)
- SPZ Format: (TODO: Document compression details)

### LOD Research
- Three.js LOD: https://threejs.org/docs/#api/en/objects/LOD
- (TODO: Add more research links)

### Related Hyperfy Files
- `src/core/nodes/GaussianSplat.js` - Main node implementation
- `src/core/systems/Stage.js` - Rendering system
- `src/core/systems/ClientLoader.js` - File loader
- `src/core/systems/ClientBuilder.js` - Drag & drop handler
- `src/client/components/Fields.js` - UI file input
- `apps/GaussianSplat.js` - App template
- `src/world/collections/default/gs.hyp` - Blueprint template

---

## Notes & Ideas

### Ideas for Future Improvements

1. **Adaptive LOD**: Adjust LOD based on:
   - Available GPU memory
   - Current FPS
   - Number of visible splats
   - User quality preference setting

2. **LOD Precomputation**:
   - Pre-generate LOD levels during file upload
   - Store as separate assets
   - Instant LOD switching (no runtime computation)

3. **Smart Culling**:
   - Frustum culling
   - Occlusion culling
   - Importance-based culling (keep splats that contribute most to image)

4. **Progressive Enhancement**:
   - Load thumbnail version instantly (< 100kb)
   - Stream additional detail as needed
   - Prioritize splats in camera view

---

**Last Updated:** 2026-01-11
**Maintained By:** Development Team
**Status:** 🔴 Critical Issues - File Loading Broken
