import * as THREE from '../extras/three'

// Spark.js will be dynamically imported when needed

/**
 * SparkGaussianSplatMaterial
 * 
 * Integration layer between Hyperfy and Spark.js for authentic Gaussian Splatting
 * Uses Spark.js SplatMesh for professional-grade splat rendering
 */
export class SparkGaussianSplatMaterial {
  constructor(parameters = {}) {
    this.parameters = {
      splatScale: parameters.splatScale || 1.0,
      opacity: parameters.opacity || 1.0,
      sphericalHarmonics: parameters.sphericalHarmonics || true,
      sortMode: parameters.sortMode || 'auto',
      color: parameters.color || '#ffffff',
      falloff: parameters.falloff || 1.0,
      ...parameters
    }
    
    this.splatMesh = null
    this.sparkRenderer = null
    this.splatEdit = null
    this.isSparkMaterial = true
    this.needsSort = parameters.sortMode !== 'none'
  }

  async loadFromURL(url) {
    try {
      // Dynamically import Spark.js
      const { SplatMesh, SparkRenderer, SplatEdit } = await import('@sparkjsdev/spark')
      
      // Create Spark SplatMesh
      this.splatMesh = new SplatMesh({ 
        url: url,
        alphaTest: 0.1,
        scale: this.parameters.splatScale
      })
      
      // Wait for loading to complete
      await this.splatMesh.loadFromURL(url)
      
      // Initialize SplatEdit for runtime modifications
      this.splatEdit = new SplatEdit(this.splatMesh)
      
      // Apply initial material properties
      this.applyMaterialProperties()
      
      return this.splatMesh
      
    } catch (error) {
      console.error('❌ Failed to load Spark.js SplatMesh:', error)
      throw error
    }
  }

  async loadFromSplatData(splatData) {
    try {
      // Dynamically import Spark.js
      const { SplatMesh } = await import('@sparkjsdev/spark')
      
      // For now, let's use a generator approach as shown in Spark.js docs
      // This creates a programmatic SplatMesh
      this.splatMesh = new SplatMesh({
        generator: (index) => {
          if (index >= splatData.count) return null
          
          // Extract data for this splat
          const pos = [
            splatData.positions[index * 3],
            splatData.positions[index * 3 + 1],
            splatData.positions[index * 3 + 2]
          ]
          
          const color = [
            splatData.colors[index * 4],
            splatData.colors[index * 4 + 1],
            splatData.colors[index * 4 + 2],
            splatData.colors[index * 4 + 3]
          ]
          
          const scale = [
            splatData.scales[index * 3],
            splatData.scales[index * 3 + 1],
            splatData.scales[index * 3 + 2]
          ]
          
          const rotation = [
            splatData.rotations[index * 4],
            splatData.rotations[index * 4 + 1],
            splatData.rotations[index * 4 + 2],
            splatData.rotations[index * 4 + 3]
          ]
          
          return {
            gsplat: {
              position: pos,
              color: color,
              scale: scale,
              rotation: rotation
            }
          }
        },
        count: splatData.count,
        alphaTest: 0.1
      })
      
      // Apply scale
      this.splatMesh.scale.setScalar(this.parameters.splatScale)
      
      return this.splatMesh
      
    } catch (error) {
      console.error('❌ Failed to create Spark.js SplatMesh from data:', error)
      throw error
    }
  }

  convertToSparkFormat(splatData) {
    // Convert our PLY data format to Spark.js expected format
    // This might need adjustment based on Spark.js actual API
    return {
      positions: splatData.positions,
      colors: splatData.colors,
      scales: splatData.scales,
      rotations: splatData.rotations,
      count: splatData.count,
      sphericalHarmonics: splatData.sphericalHarmonics
    }
  }

  setSplatScale(scale) {
    this.parameters.splatScale = scale
    if (this.splatMesh) {
      this.splatMesh.scale.setScalar(scale)
    }
  }

  setOpacity(opacity) {
    this.parameters.opacity = opacity
    if (this.splatMesh && this.splatMesh.material) {
      this.splatMesh.material.opacity = opacity
    }
  }

  setSphericalHarmonics(enabled) {
    this.parameters.sphericalHarmonics = enabled
    // Spark.js might handle this automatically
  }

  updateViewport(width, height) {
    // Spark.js handles viewport automatically through THREE.js
  }

  updateCamera(camera) {
    // Spark.js handles camera updates automatically
  }

  updateTime(time) {
    // For any time-based animations
  }

  applyMaterialProperties() {
    if (!this.splatEdit) return

    // Apply color modification using SDF sphere
    if (this.parameters.color !== '#ffffff') {
      this.splatEdit.addEdit({
        shape: 'sphere',
        center: [0, 0, 0],
        radius: 999, // Large radius to affect all splats
        blendMode: 'MULTIPLY',
        color: this.hexToRgba(this.parameters.color),
        falloff: this.parameters.falloff
      })
    }

    // Apply opacity modification
    if (this.parameters.opacity !== 1.0) {
      this.splatEdit.addEdit({
        shape: 'sphere',
        center: [0, 0, 0],
        radius: 999,
        blendMode: 'SET_ALPHA',
        alpha: this.parameters.opacity,
        falloff: this.parameters.falloff
      })
    }
  }

  hexToRgba(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
      1.0
    ] : [1, 1, 1, 1]
  }

  updateColor(color) {
    this.parameters.color = color
    if (this.splatEdit) {
      this.splatEdit.clearEdits()
      this.applyMaterialProperties()
    }
  }

  updateOpacity(opacity) {
    this.parameters.opacity = opacity
    if (this.splatEdit) {
      this.splatEdit.clearEdits()
      this.applyMaterialProperties()
    }
  }

  updateFalloff(falloff) {
    this.parameters.falloff = falloff
    if (this.splatEdit) {
      this.splatEdit.clearEdits()
      this.applyMaterialProperties()
    }
  }

  getMesh() {
    return this.splatMesh
  }

  dispose() {
    if (this.splatMesh) {
      this.splatMesh.dispose?.()
      this.splatMesh = null
    }
  }
}