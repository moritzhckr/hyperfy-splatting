# Spark.js SplatMesh Debug Information

## Overview
This document contains debug information about Spark.js SplatMesh methods and properties discovered during troubleshooting of Gaussian splat scaling issues in Hyperfy.

## SplatMesh Methods and Properties

### Available Methods (49 total)
```
['isObject3D', 'id', 'uuid', 'name', 'type', 'parent', 'children', 'up', 'position', 'rotation', 'quaternion', 'scale', 'modelViewMatrix', 'normalMatrix', 'matrix', 'matrixWorld', 'matrixAutoUpdate', 'matrixWorldAutoUpdate', 'matrixWorldNeedsUpdate', 'layers', 'visible', 'castShadow', 'receiveShadow', 'frustumCulled', 'renderOrder', 'animations', 'userData', 'numSplats', 'generator', 'frameUpdate', 'version', 'isInitialized', 'recolor', 'opacity', 'enableViewToObject', 'enableViewToWorld', 'enableWorldToView', 'skinning', 'edits', 'rgbaDisplaceEdits', 'splatRgba', 'maxSh', 'packedSplats', 'editable', 'onFrame', 'context', 'objectModifier', 'worldModifier', 'initialized']
```

### Prototype Methods (11 total)
```
['constructor', 'asyncInitialize', 'pushSplat', 'forEachSplat', 'dispose', 'getBoundingBox', 'constructGenerator', 'updateGenerator', 'update', 'raycast', 'ensureShTextures']
```

## Key Properties for Scaling

### 1. Splat Data Access
- **`numSplats`**: Number of splats in the mesh
- **`forEachSplat(callback)`**: Iterate through all splats
- **`generator`**: Function that generates splat data

### 2. Scaling-Related Properties
- **`scale`**: THREE.js scale property (may be ignored by Spark.js)
- **`objectModifier`**: Object-level modifications
- **`worldModifier`**: World-level modifications
- **`context`**: Rendering context (may contain scale property)

### 3. Material Properties
- **`material.uniforms`**: Shader uniforms (may contain scale)
- **`opacity`**: Splat opacity
- **`recolor`**: Color modifications

## Scaling Approaches Tested

### Approach 1: Direct THREE.js Scale
```javascript
splatMesh.scale.setScalar(splatScale)
```
**Result**: Applied but may be ignored by Spark.js internal rendering

### Approach 2: Material Uniforms
```javascript
if (splatMesh.material && splatMesh.material.uniforms) {
  if (splatMesh.material.uniforms.scale) {
    splatMesh.material.uniforms.scale.value = splatScale
  }
}
```
**Result**: Depends on shader implementation

### Approach 3: Direct Splat Data Scaling
```javascript
if (splatMesh.forEachSplat) {
  splatMesh.forEachSplat((splat, index) => {
    if (splat.position) {
      splat.position[0] *= splatScale
      splat.position[1] *= splatScale
      splat.position[2] *= splatScale
    }
    if (splat.scale) {
      splat.scale[0] *= splatScale
      splat.scale[1] *= splatScale
      splat.scale[2] *= splatScale
    }
  })
}
```
**Result**: Most direct approach, modifies actual splat data

### Approach 4: Generator Function Modification
```javascript
if (splatMesh.generator) {
  const originalGenerator = splatMesh.generator
  splatMesh.generator = (index) => {
    const result = originalGenerator(index)
    if (result && result.gsplat) {
      if (result.gsplat.position) {
        result.gsplat.position = result.gsplat.position.map(coord => coord * splatScale)
      }
      if (result.gsplat.scale) {
        result.gsplat.scale = result.gsplat.scale.map(scale => scale * splatScale)
      }
    }
    return result
  }
}
```
**Result**: Modifies data generation, may require `updateGenerator()` call

### Approach 5: Context Scaling
```javascript
if (splatMesh.context && splatMesh.context.scale) {
  splatMesh.context.scale = splatScale
}
```
**Result**: Depends on context implementation

### Approach 6: Object/World Modifiers
```javascript
if (splatMesh.objectModifier) {
  splatMesh.objectModifier.scale = splatScale
}
if (splatMesh.worldModifier) {
  splatMesh.worldModifier.scale = splatScale
}
```
**Result**: Depends on modifier implementation

## Initialization Timing

### Critical Issue: Timing
- **Problem**: Splats must be fully loaded before scaling
- **Solution**: Wait for `isInitialized` and `numSplats > 0`
- **Code**:
```javascript
while (!splatMesh.isInitialized && splatMesh.numSplats === 0) {
  await new Promise(resolve => setTimeout(resolve, 10))
}
```

## File Format Support

### SPZ Files
- Use `splatData.createSplatMesh({ scale: splatScale })`
- May support scale parameter during creation

### SOGS Files
- Use `new SplatMesh({ url, fileType, scale: splatScale })`
- May support scale parameter during creation

### Other Formats (PLY, KSPLAT, etc.)
- Use `splatData.createSplatMesh({ scale: splatScale })`
- May support scale parameter during creation

## Debug Logging

### Useful Debug Information
```javascript
console.log('🔍 SplatMesh methods:', Object.getOwnPropertyNames(splatMesh))
console.log('🔍 SplatMesh prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(splatMesh)))
console.log('🔍 SplatMesh constructor:', splatMesh.constructor.name)
console.log('🔧 SplatMesh state:', {
  scale: splatMesh.scale,
  matrix: splatMesh.matrix,
  matrixWorld: splatMesh.matrixWorld,
  numSplats: splatMesh.numSplats,
  isInitialized: splatMesh.isInitialized
})
```

## Common Issues

### 1. Generator Modification After Loading
- **Problem**: Modifying generator after splats are loaded may corrupt data
- **Solution**: Apply scaling before or during initialization

### 2. THREE.js Scale Ignored
- **Problem**: Spark.js may ignore THREE.js scale property
- **Solution**: Use Spark.js-specific scaling methods

### 3. Timing Issues
- **Problem**: Scaling before splats are loaded
- **Solution**: Wait for initialization completion

### 4. WebGL Errors
- **Problem**: Generator modification can cause WebGL texture format mismatches
- **Solution**: Avoid modifying generator after initialization

## Recommendations

### For Future Development
1. **Test scale parameter during creation** first
2. **Use direct splat data modification** as fallback
3. **Always wait for initialization** before scaling
4. **Avoid generator modification** after loading
5. **Check for Spark.js-specific scaling APIs**

### Debugging Steps
1. Log all available methods and properties
2. Test each scaling approach systematically
3. Check timing of scaling application
4. Verify splat data modification
5. Monitor for WebGL errors

## Notes
- Spark.js SplatMesh has its own internal scaling logic
- THREE.js scale property may be ignored
- Direct splat data modification is most reliable
- Timing is critical for proper scaling
- Different file formats may require different approaches
