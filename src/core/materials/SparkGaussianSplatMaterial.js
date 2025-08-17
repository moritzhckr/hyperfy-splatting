import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark'
import * as THREE from '../extras/three'

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
      ...parameters
    }
    
    this.splatMesh = null
    this.sparkRenderer = null
    this.isSparkMaterial = true
    this.needsSort = parameters.sortMode !== 'none'
  }

  async loadFromURL(url) {
    try {
      console.log('🔥 Loading Gaussian Splat with Spark.js:', url)
      
      // Create Spark SplatMesh
      this.splatMesh = new SplatMesh({ 
        url: url,
        alphaTest: 0.1,
        scale: this.parameters.splatScale
      })
      
      // Wait for loading to complete
      await this.splatMesh.loadFromURL(url)
      
      console.log('✅ Spark.js SplatMesh loaded successfully')
      return this.splatMesh
      
    } catch (error) {
      console.error('❌ Failed to load Spark.js SplatMesh:', error)
      throw error
    }
  }

  loadFromSplatData(splatData) {
    try {
      console.log('🔥 Creating Spark.js SplatMesh from data:', {
        count: splatData.count,
        hasPositions: !!splatData.positions,
        hasColors: !!splatData.colors
      })
      
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
      
      console.log('✅ Spark.js SplatMesh created from generator')
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