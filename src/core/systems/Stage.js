import * as THREE from '../extras/three'
import { isNumber } from 'lodash-es'

import { System } from './System'
import { LooseOctree } from '../extras/LooseOctree'

// Spark.js will be dynamically imported on client-side only

const vec2 = new THREE.Vector2()

/**
 * Stage System
 *
 * - Runs on both the server and client.
 * - Allows inserting meshes etc into the world, and providing a handle back.
 * - Automatically handles instancing/batching.
 * - This is a logical scene graph, no rendering etc is handled here.
 *
 */
export class Stage extends System {
  constructor(world) {
    super(world)
    this.scene = new THREE.Scene()
    this.models = new Map() // id -> Model
    this.splatMeshes = new Map() // id -> SplatMesh instances
    this.octree = new LooseOctree({
      scene: this.scene,
      center: new THREE.Vector3(0, 0, 0),
      size: 10,
    })
    this.defaultMaterial = null
    this.raycaster = new THREE.Raycaster()
    this.raycaster.firstHitOnly = true
    this.raycastHits = []
    this.maskNone = new THREE.Layers()
    this.maskNone.enableAll()
    this.dirtyNodes = new Set()
  }

  init({ viewport }) {
    this.viewport = viewport
    this.scene.add(this.world.rig)
  }

  update(delta) {
    this.models.forEach(model => model.clean())
  }

  postUpdate() {
    this.clean() // after update all matrices should be up to date for next step
  }

  postLateUpdate() {
    this.clean() // after lateUpdate all matrices should be up to date for next step
  }

  getDefaultMaterial() {
    if (!this.defaultMaterial) {
      this.defaultMaterial = this.createMaterial()
    }
    return this.defaultMaterial
  }

  clean() {
    for (const node of this.dirtyNodes) {
      node.clean()
    }
    this.dirtyNodes.clear()
  }

  insert(options) {
    if (options.linked) {
      return this.insertLinked(options)
    } else {
      return this.insertSingle(options)
    }
  }

  insertLinked({ geometry, material, castShadow, receiveShadow, node, matrix }) {
    const id = `${geometry.uuid}/${material.uuid}/${castShadow}/${receiveShadow}`
    if (!this.models.has(id)) {
      const model = new Model(this, geometry, material, castShadow, receiveShadow)
      this.models.set(id, model)
    }
    return this.models.get(id).create(node, matrix)
  }

  insertSingle({ geometry, material, castShadow, receiveShadow, node, matrix }) {
    material = this.createMaterial({ raw: material })
    const mesh = new THREE.Mesh(geometry, material.raw)
    mesh.castShadow = castShadow
    mesh.receiveShadow = receiveShadow
    mesh.matrixWorld.copy(matrix)
    mesh.matrixAutoUpdate = false
    mesh.matrixWorldAutoUpdate = false
    const sItem = {
      matrix,
      geometry,
      material: material.raw,
      getEntity: () => node.ctx.entity,
      node,
    }
    this.scene.add(mesh)
    this.octree.insert(sItem)
    return {
      material: material.proxy,
      move: matrix => {
        mesh.matrixWorld.copy(matrix)
        this.octree.move(sItem)
      },
      destroy: () => {
        this.scene.remove(mesh)
        this.octree.remove(sItem)
      },
    }
  }

  createMaterial(options = {}) {
    const self = this
    const material = {}
    let raw
    if (options.raw) {
      raw = options.raw.clone()
      raw.onBeforeCompile = options.raw.onBeforeCompile
    } else if (options.unlit) {
      raw = new THREE.MeshBasicMaterial({
        color: options.color || 'white',
      })
    } else {
      raw = new THREE.MeshStandardMaterial({
        color: options.color || 'white',
        metalness: isNumber(options.metalness) ? options.metalness : 0,
        roughness: isNumber(options.roughness) ? options.roughness : 1,
      })
    }
    raw.shadowSide = THREE.BackSide // fix csm shadow banding
    const textures = []
    if (raw.map) {
      raw.map = raw.map.clone()
      textures.push(raw.map)
    }
    if (raw.emissiveMap) {
      raw.emissiveMap = raw.emissiveMap.clone()
      textures.push(raw.emissiveMap)
    }
    if (raw.normalMap) {
      raw.normalMap = raw.normalMap.clone()
      textures.push(raw.normalMap)
    }
    if (raw.bumpMap) {
      raw.bumpMap = raw.bumpMap.clone()
      textures.push(raw.bumpMap)
    }
    if (raw.roughnessMap) {
      raw.roughnessMap = raw.roughnessMap.clone()
      textures.push(raw.roughnessMap)
    }
    if (raw.metalnessMap) {
      raw.metalnessMap = raw.metalnessMap.clone()
      textures.push(raw.metalnessMap)
    }
    this.world.setupMaterial(raw)
    const proxy = {
      get id() {
        return raw.uuid
      },
      get textureX() {
        return textures[0]?.offset.x
      },
      set textureX(val) {
        for (const tex of textures) {
          tex.offset.x = val
        }
        raw.needsUpdate = true
      },
      get textureY() {
        return textures[0]?.offset.y
      },
      set textureY(val) {
        for (const tex of textures) {
          tex.offset.y = val
        }
        raw.needsUpdate = true
      },
      get color() {
        return raw.color
      },
      set color(val) {
        if (typeof val !== 'string') {
          throw new Error('[material] color must be a string (e.g. "red", "#ff0000", "rgb(255,0,0)")')
        }
        raw.color.set(val)
        raw.needsUpdate = true
      },
      get emissiveIntensity() {
        return raw.emissiveIntensity
      },
      set emissiveIntensity(value) {
        if (!isNumber(value)) {
          throw new Error('[material] emissiveIntensity not a number')
        }
        raw.emissiveIntensity = value
        raw.needsUpdate = true
      },
      get fog() {
        return raw.fog
      },
      set fog(value) {
        raw.fog = value
        raw.needsUpdate = true
      },
      // TODO: not yet
      // clone() {
      //   return self.createMaterial(options).proxy
      // },
      get _ref() {
        if (world._allowMaterial) return material
      },
    }
    material.raw = raw
    material.proxy = proxy
    return material
  }

  raycastPointer(position, layers = this.maskNone, min = 0, max = Infinity) {
    if (!this.viewport) throw new Error('no viewport')
    const rect = this.viewport.getBoundingClientRect()
    vec2.x = ((position.x - rect.left) / rect.width) * 2 - 1
    vec2.y = -((position.y - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(vec2, this.world.camera)
    this.raycaster.layers = layers
    this.raycaster.near = min
    this.raycaster.far = max
    this.raycastHits.length = 0
    this.octree.raycast(this.raycaster, this.raycastHits)
    return this.raycastHits
  }

  raycastReticle(layers = this.maskNone, min = 0, max = Infinity) {
    if (!this.viewport) throw new Error('no viewport')
    vec2.x = 0
    vec2.y = 0
    this.raycaster.setFromCamera(vec2, this.world.camera)
    this.raycaster.layers = layers
    this.raycaster.near = min
    this.raycaster.far = max
    this.raycastHits.length = 0
    this.octree.raycast(this.raycaster, this.raycastHits)
    return this.raycastHits
  }

  async insertGaussianSplat({ url, node, matrix, sortMode = 'auto', color = '#ffffff', opacity = 1.0 }) {
    // Only create SplatMesh on client
    if (this.world.network.isServer) {
      return {
        splatMesh: null,
        move: () => {},
        destroy: () => {}
      }
    }
    
    try {
      // Dynamically import Spark.js only on client
      const { SplatMesh, SplatLoader } = await import('@sparkjsdev/spark')
      // Detect file type from original source URL first
      let fileType = null
      const srcUrl = node._src || url
      if (srcUrl) {
        const ext = srcUrl.split('.').pop()?.toLowerCase()
        if (ext === 'ksplat' || ext === 'splat') {
          fileType = ext
        } else if (ext === 'sogs') {
          fileType = 'pcsogs'
        } else if (ext === 'zip' && srcUrl.toLowerCase().includes('sogs')) {
          fileType = 'pcsogszip'  // SOGS in ZIP format
        } else if (ext === 'sogsz' || ext === 'sogszip') {
          fileType = 'pcsogszip'  // Alternative SOGS ZIP extensions
        }
      }
      
      // For KSPLAT/SPLAT/SOGS: Use asset URL directly (not blob URL)
      // because Spark.js needs the file extension to detect format
      let actualUrl = url
      if (fileType === 'ksplat' || fileType === 'splat' || fileType === 'pcsogs' || fileType === 'pcsogszip') {
        actualUrl = this.world.resolveURL(srcUrl)
      } else {
        // For other formats: Use cached file if available
        if (node._src && this.world.loader.hasFile(node._src)) {
          const cachedFile = this.world.loader.getFile(node._src)
          if (cachedFile) {
            actualUrl = URL.createObjectURL(cachedFile)
          }
        }
      }
      
      // Create SplatMesh with explicit fileType for special formats
      const splatMeshOptions = { url: actualUrl }
      if (fileType) {
        splatMeshOptions.fileType = fileType
        console.log('🎯 Loading splat with fileType:', fileType, 'from URL:', actualUrl)
      }
      
      // Add timeout for large files (5 minutes max)
      const loadTimeout = setTimeout(() => {
        console.warn('⏰ Splat loading timeout after 5 minutes')
        console.warn('   File may be too large or corrupted')
        console.warn('   Consider using a smaller file or different format')
      }, 5 * 60 * 1000)
      
      const splatMesh = new SplatMesh(splatMeshOptions)
      
      // Immediately check if already loaded (synchronous case)
      const checkLoadedState = () => {
        // Use the correct properties: numSplats, isInitialized, initialized
        if (splatMesh.numSplats > 0 || splatMesh.isInitialized === true || splatMesh.initialized === true) {
          clearTimeout(loadTimeout)
          logSplatInfo(splatMesh)
          return true
        }
        return false
      }
      
      // Helper function to log splat info
      const logSplatInfo = (mesh) => {
        // Memory usage monitoring for development
        if (performance.memory) {
          const memory = performance.memory
          const memoryUsagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
          if (memoryUsagePercent > 90) {
            console.warn('⚠️ High memory usage (' + Math.round(memoryUsagePercent) + '%)! Browser may become unstable.')
          } else if (memoryUsagePercent > 75) {
            console.info('ℹ️ Memory usage: ' + Math.round(memoryUsagePercent) + '%')
          }
        }
      }
      
      // Check if already loaded
      if (!checkLoadedState()) {
        // Listen for load events with multiple event names
        const onLoaded = () => {
          clearTimeout(loadTimeout)
          logSplatInfo(splatMesh)
        }
        
        // Try Spark.js specific events and common Three.js events
        const eventNames = ['initialized', 'ready', 'loaded', 'load', 'complete', 'asyncInitialize']
        eventNames.forEach(eventName => {
          if (typeof splatMesh.addEventListener === 'function') {
            splatMesh.addEventListener(eventName, onLoaded)
          }
        })
        
        // For KSPLAT/SPLAT/SOGS files: Try manual asyncInitialize() with correct parameters
        if (fileType === 'ksplat' || fileType === 'splat' || fileType === 'pcsogs' || fileType === 'pcsogszip') {
          if (typeof splatMesh.asyncInitialize === 'function') {
            const initOptions = { url: actualUrl, fileType: fileType }
            splatMesh.asyncInitialize(initOptions).then(() => {
              logSplatInfo(splatMesh)
            }).catch(error => {
              console.error('❌ asyncInitialize() failed for format:', fileType, error)
              
              // Alternative: Try without options or with different options
              splatMesh.asyncInitialize().then(() => {
                logSplatInfo(splatMesh)
              }).catch(err2 => {
                console.error('❌ Alternative also failed:', err2.message)
              })
            })
          }
        }
        
        // Error handling
        if (typeof splatMesh.addEventListener === 'function') {
          splatMesh.addEventListener('error', (error) => {
            clearTimeout(loadTimeout)
            console.error('❌ Splat loading error:', error)
          })
        }
        
        // Light polling: Check load state every 2 seconds
        let pollCount = 0
        const pollInterval = setInterval(() => {
          pollCount++
          
          if (checkLoadedState()) {
            clearInterval(pollInterval)
          }
          
          // Stop polling after 30 checks (60 seconds) for KSPLAT/SOGS
          const maxPolls = (fileType === 'ksplat' || fileType === 'splat' || fileType === 'pcsogs' || fileType === 'pcsogszip') ? 30 : 15
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval)
          }
        }, 2000)
      }
      
      // Apply transform
      splatMesh.matrix.copy(matrix)
      splatMesh.matrixAutoUpdate = false
      splatMesh.updateMatrixWorld(true)
      
      // Add to scene
      this.scene.add(splatMesh)
      
      // Store reference
      const id = node.id || `splat_${Date.now()}`
      this.splatMeshes.set(id, splatMesh)
      
      // Helper function to convert hex to RGBA (shared across all methods)
      const hexToRgba = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
          1.0
        ] : [1, 1, 1, 1]
      }

      // Apply color/opacity modifications using direct SplatMesh properties
      let splatProperties = {
        color: color,
        opacity: opacity
      }
      
      try {
        const THREE = await import('three')
        
        // Apply initial color using SplatMesh.recolor property
        if (color && color !== '#ffffff') {
          const colorObj = new THREE.Color(color)
          // SplatMesh.recolor is a Vector3 that multiplies with splat colors
          splatMesh.recolor.set(colorObj.r, colorObj.g, colorObj.b)
          console.log('🎨 Applied initial recolor:', colorObj.r, colorObj.g, colorObj.b)
        }
        
        // Apply initial opacity using SplatMesh.opacity property
        if (opacity !== undefined && opacity !== 1.0) {
          splatMesh.opacity = opacity
          console.log('🔍 Applied initial opacity:', opacity)
        }
        
        console.log('🎨 Direct SplatMesh properties initialized:', { color, opacity })
        
      } catch (error) {
        console.warn('⚠️ Failed to apply initial splat properties:', error.message)
      }
      
      // Return handle with update methods
      return {
        splatMesh,
        move: (newMatrix) => {
          splatMesh.matrix.copy(newMatrix)
          splatMesh.updateMatrixWorld(true)
        },
        updateColor: async (newColor) => {
          console.log('🎨 Updating splat color to:', newColor)
          splatProperties.color = newColor // Update stored value
          try {
            const THREE = await import('three')
            const colorObj = new THREE.Color(newColor)
            // Update SplatMesh.recolor property directly
            splatMesh.recolor.set(colorObj.r, colorObj.g, colorObj.b)
            console.log('🎨 Updated recolor:', colorObj.r, colorObj.g, colorObj.b)
          } catch (error) {
            console.warn('⚠️ Failed to update color:', error)
          }
        },
        updateOpacity: async (newOpacity) => {
          console.log('🔍 Updating splat opacity to:', newOpacity)
          splatProperties.opacity = newOpacity // Update stored value
          try {
            // Update SplatMesh.opacity property directly
            splatMesh.opacity = newOpacity
            console.log('🔍 Updated opacity:', newOpacity)
          } catch (error) {
            console.warn('⚠️ Failed to update opacity:', error)
          }
        },
        // Falloff property removed - was causing cross-splat contamination
        destroy: () => {
          this.scene.remove(splatMesh)
          this.splatMeshes.delete(id)
          splatMesh.dispose?.()
        }
      }
      
    } catch (error) {
      console.error('❌ SplatMesh creation failed:', error)
      return null
    }
  }

  destroy() {
    this.models.clear()
    // Clean up splat meshes
    for (const [id, splatMesh] of this.splatMeshes) {
      this.scene.remove(splatMesh)
      if (splatMesh.dispose) {
        splatMesh.dispose()
      }
    }
    this.splatMeshes.clear()
  }
}

class Model {
  constructor(stage, geometry, material, castShadow, receiveShadow) {
    material = stage.createMaterial({ raw: material })

    this.stage = stage
    this.geometry = geometry
    this.material = material
    this.castShadow = castShadow
    this.receiveShadow = receiveShadow

    if (!this.geometry.boundsTree) this.geometry.computeBoundsTree()

    // this.mesh = mesh.clone()
    // this.mesh.geometry.computeBoundsTree() // three-mesh-bvh
    // // this.mesh.geometry.computeBoundingBox() // spatial octree
    // // this.mesh.geometry.computeBoundingSphere() // spatial octree
    // this.mesh.material.shadowSide = THREE.BackSide // fix csm shadow banding
    // this.mesh.castShadow = true
    // this.mesh.receiveShadow = true
    // this.mesh.matrixAutoUpdate = false
    // this.mesh.matrixWorldAutoUpdate = false

    this.iMesh = new THREE.InstancedMesh(this.geometry, this.material.raw, 10)
    // this.iMesh.name = this.mesh.name
    this.iMesh.castShadow = this.castShadow
    this.iMesh.receiveShadow = this.receiveShadow
    this.iMesh.matrixAutoUpdate = false
    this.iMesh.matrixWorldAutoUpdate = false
    this.iMesh.frustumCulled = false
    this.iMesh.getEntity = this.getEntity.bind(this)
    this.items = [] // { idx, node, matrix, color }
    this.dirty = true
  }

  create(node, matrix) {
    const item = {
      idx: this.items.length,
      node,
      matrix,
      color: null,
      // octree
    }
    this.items.push(item)
    this.iMesh.setMatrixAt(item.idx, item.matrix) // silently fails if too small, gets increased in clean()
    this.dirty = true
    const sItem = {
      matrix,
      geometry: this.geometry,
      material: this.material.raw,
      getEntity: () => this.items[item.idx]?.node.ctx.entity,
      node,
    }
    this.stage.octree.insert(sItem)
    return {
      material: this.material.proxy,
      move: matrix => {
        this.move(item, matrix)
        this.stage.octree.move(sItem)
      },
      setColor: value => {
        if (!item.color) item.color = new THREE.Color()
        item.color.set(value)
        this.iMesh.setColorAt(item.idx, item.color)
        this.iMesh.instanceColor.needsUpdate = true
      },
      destroy: () => {
        this.destroy(item)
        this.stage.octree.remove(sItem)
      },
    }
  }

  move(item, matrix) {
    item.matrix.copy(matrix)
    this.iMesh.setMatrixAt(item.idx, matrix)
    this.dirty = true
  }

  destroy(item) {
    const last = this.items[this.items.length - 1]
    const isOnly = this.items.length === 1
    const isLast = item === last
    if (isOnly) {
      this.items = []
      this.dirty = true
    } else if (isLast) {
      // this is the last instance in the buffer, pop it off the end
      this.items.pop()
      this.dirty = true
    } else {
      // there are other instances after this one in the buffer, swap it with the last one and pop it off the end
      this.iMesh.setMatrixAt(item.idx, last.matrix)
      if (last.color) this.iMesh.setColorAt(item.idx, last.color)
      last.idx = item.idx
      this.items[item.idx] = last
      this.items.pop()
      this.dirty = true
    }
  }

  clean() {
    if (!this.dirty) return
    const size = this.iMesh.instanceMatrix.array.length / 16
    const count = this.items.length
    if (size < this.items.length) {
      const newSize = count + 100
      // console.log('increase', this.mesh.name, 'from', size, 'to', newSize)
      this.iMesh.resize(newSize)
      for (let i = size; i < count; i++) {
        const item = this.items[i]
        this.iMesh.setMatrixAt(i, item.matrix)
        if (item.color) this.iMesh.setColorAt(i, item.color)
      }
    }
    this.iMesh.count = count
    if (this.iMesh.parent && !count) {
      this.stage.scene.remove(this.iMesh)
      this.dirty = false
      return
    }
    if (!this.iMesh.parent && count) {
      this.stage.scene.add(this.iMesh)
    }
    this.iMesh.instanceMatrix.needsUpdate = true
    if (this.iMesh.instanceColor) {
      this.iMesh.instanceColor.needsUpdate = true
    }
    // this.iMesh.computeBoundingSphere()
    this.dirty = false
  }

  getEntity(instanceId) {
    console.warn('TODO: remove if you dont ever see this')
    return this.items[instanceId]?.node.ctx.entity
  }

  getTriangles() {
    const geometry = this.geometry
    if (geometry.index !== null) {
      return geometry.index.count / 3
    } else {
      return geometry.attributes.position.count / 3
    }
  }
}
