import * as THREE from '../extras/three'
import { isNumber } from 'lodash-es'

import { System } from './System'
import { LooseOctree } from '../extras/LooseOctree'
import { detectSplatFormat, getSparkFileType } from '../utils/splatFormats'
import { getSparkModule } from '../utils/sparkCache'

// Spark.js will be dynamically imported on client-side only
// SparkRenderer attached to camera for float16 precision fix
let sparkRendererInstance = null

// Pre-computed 180° rotation quaternion around X-axis for splat orientation fix
// Splat files are typically exported upside-down and need this internal correction
const SPLAT_FLIP_QUATERNION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
const _tempPosition = new THREE.Vector3()
const _tempQuaternion = new THREE.Quaternion()
const _tempScale = new THREE.Vector3()

// Device-based performance settings
const getDevicePerformanceTier = () => {
  if (typeof window === 'undefined') return 'desktop'

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  const isQuest = /OculusBrowser|Quest/i.test(navigator.userAgent)
  const hasLowMemory = navigator.deviceMemory && navigator.deviceMemory < 4

  if (isQuest) return 'quest'
  if (isMobile || hasLowMemory) return 'mobile'
  return 'desktop'
}

// LOD scale: higher = more aggressive culling = fewer splats rendered
const getDefaultLodRenderScale = () => {
  const tier = getDevicePerformanceTier()
  switch (tier) {
    case 'quest': return 6.0    // Very aggressive LOD for Quest
    case 'mobile': return 5.0   // Very aggressive LOD for mobile
    default: return 1.0         // Normal LOD for desktop
  }
}

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

  update(_delta) {
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

  insertLinked({ geometry, material, uberShader, castShadow, receiveShadow, node, matrix }) {
    const id = `${geometry.uuid}/${material.uuid}/${uberShader}/${castShadow}/${receiveShadow}`
    if (!this.models.has(id)) {
      const model = new Model(this, geometry, material, uberShader, castShadow, receiveShadow)
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
      get _ref() {
        if (typeof globalThis.world !== 'undefined' && globalThis.world._allowMaterial) return material
        return undefined
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

    // Also raycast against SplatMeshes using Three.js standard raycasting
    this._raycastSplatMeshes(this.raycaster, this.raycastHits)

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

    // Also raycast against SplatMeshes using Three.js standard raycasting
    this._raycastSplatMeshes(this.raycaster, this.raycastHits)

    return this.raycastHits
  }

  // Internal splat raycast - DISABLED for continuous raycasting (performance)
  _raycastSplatMeshes(raycaster, hits) {
    // Disabled for continuous use - too expensive every frame
    // Use raycastSplatsOnDemand() for on-click selection instead
    return
  }

  // On-demand splat raycasting - call this only on click/selection, not every frame!
  // Uses Spark.js native WASM-based ellipsoid raycasting for precision
  raycastSplatsOnDemand(raycaster) {
    if (this.splatMeshes.size === 0) return []

    const hits = []

    // Raycast ALL splats directly using Spark's precise ellipsoid raycasting
    // No bounding box pre-check needed - Spark's WASM is fast enough for on-demand use
    for (const [id, splatMesh] of this.splatMeshes) {
      if (!splatMesh.isInitialized) continue

      const splatHits = []
      // Spark.js raycast uses WASM with RAYCAST_ELLIPSOID=true
      // This tests against actual splat ellipsoids, not just bounding boxes
      splatMesh.raycast(raycaster, splatHits)

      for (const hit of splatHits) {
        const foundNode = splatMesh._hyperfyNode
        hits.push({
          distance: hit.distance,
          point: hit.point,
          node: foundNode,
          getEntity: () => foundNode?.ctx?.entity,
          object: splatMesh
        })
      }
    }

    hits.sort((a, b) => a.distance - b.distance)
    return hits
  }

  // Helper: Setup raycaster from pointer position for on-demand splat selection
  raycastSplatsAtPointer(position) {
    if (!this.viewport) return []
    const rect = this.viewport.getBoundingClientRect()
    vec2.x = ((position.x - rect.left) / rect.width) * 2 - 1
    vec2.y = -((position.y - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(vec2, this.world.camera)
    return this.raycastSplatsOnDemand(this.raycaster)
  }

  // Helper: Setup raycaster from reticle (center screen) for on-demand splat selection
  raycastSplatsAtReticle() {
    if (!this.viewport) return []
    vec2.x = 0
    vec2.y = 0
    this.raycaster.setFromCamera(vec2, this.world.camera)
    return this.raycastSplatsOnDemand(this.raycaster)
  }

  // Helper: Setup common splat mesh properties
  _setupSplatMesh(splatMesh, { node, matrix, color, opacity, splatScale, lodRenderScale }) {
    // Apply LOD render scale
    if (splatMesh.lodRenderScale !== undefined) {
      splatMesh.lodRenderScale = lodRenderScale || getDefaultLodRenderScale()
    }

    // Apply user scale
    if (splatScale && splatScale !== 1.0) {
      splatMesh.scale.setScalar(splatScale)
    }

    // Apply transform with internal 180° X-axis flip for correct splat orientation
    // Decompose user matrix, apply flip rotation, recompose
    matrix.decompose(_tempPosition, _tempQuaternion, _tempScale)
    _tempQuaternion.multiply(SPLAT_FLIP_QUATERNION) // Apply flip in local space
    splatMesh.matrix.compose(_tempPosition, _tempQuaternion, _tempScale)
    splatMesh.matrixAutoUpdate = false
    splatMesh.updateMatrixWorld(true)

    // Store node reference for raycasting
    splatMesh._hyperfyNode = node
    this.scene.add(splatMesh)

    // Store reference
    const id = node.id || `splat_${Date.now()}`
    this.splatMeshes.set(id, splatMesh)

    // Apply color/opacity - use already imported THREE
    if (color && color !== '#ffffff') {
      const colorObj = new THREE.Color(color)
      splatMesh.recolor.set(colorObj.r, colorObj.g, colorObj.b)
    }
    if (opacity !== undefined && opacity !== 1.0) {
      splatMesh.opacity = opacity
    }

    return id
  }

  // Helper: Create splat handle object
  _createSplatHandle(splatMesh, { id, srcUrl, removeFromCache = false, loadInterval = null }) {
    // Store interval ID on the splatMesh for cleanup
    if (loadInterval) {
      splatMesh._loadIntervalId = loadInterval
    }

    return {
      splatMesh,
      move: (newMatrix) => {
        // Apply same internal 180° flip as in _setupSplatMesh
        newMatrix.decompose(_tempPosition, _tempQuaternion, _tempScale)
        _tempQuaternion.multiply(SPLAT_FLIP_QUATERNION)
        splatMesh.matrix.compose(_tempPosition, _tempQuaternion, _tempScale)
        splatMesh.updateMatrixWorld(true)
      },
      updateColor: (newColor) => {
        const colorObj = new THREE.Color(newColor)
        splatMesh.recolor.set(colorObj.r, colorObj.g, colorObj.b)
      },
      updateOpacity: (newOpacity) => {
        splatMesh.opacity = newOpacity
      },
      updateSplatScale: (newScale) => {
        splatMesh.scale.setScalar(newScale)
      },
      updateLodRenderScale: (newLodRenderScale) => {
        if (splatMesh.lodRenderScale !== undefined) {
          splatMesh.lodRenderScale = newLodRenderScale
        }
      },
      destroy: () => {
        // Clean up SOGS load interval if exists
        if (splatMesh._loadIntervalId) {
          clearInterval(splatMesh._loadIntervalId)
          splatMesh._loadIntervalId = null
        }
        this.scene.remove(splatMesh)
        this.splatMeshes.delete(id)
        splatMesh.dispose?.()
        if (removeFromCache && srcUrl) {
          this.world.loader.remove('splat', srcUrl)
        }
      }
    }
  }

  async insertGaussianSplat({ url, node, matrix, color = '#ffffff', opacity = 1.0, splatScale = 1.0, lodRenderScale = 1.0 }) {
    // Only create SplatMesh on client
    if (this.world.network.isServer) {
      return {
        splatMesh: null,
        move: () => {},
        destroy: () => {}
      }
    }

    try {
      // Dynamically import Spark.js only on client using cached import
      const { SplatMesh, SparkRenderer } = await getSparkModule()

      // Create SparkRenderer singleton and attach to camera for float16 precision fix
      if (!sparkRendererInstance && this.world.camera && this.world.graphics?.renderer) {
        sparkRendererInstance = new SparkRenderer({
          renderer: this.world.graphics.renderer
        })
        this.world.camera.add(sparkRendererInstance)

        // Reduce maxStdDev on mobile/Quest for better performance
        const tier = getDevicePerformanceTier()
        if (tier === 'quest') {
          sparkRendererInstance.maxStdDev = 1.8
        } else if (tier === 'mobile') {
          sparkRendererInstance.maxStdDev = 1.5
        }
        console.log(`✅ SparkRenderer attached (tier: ${tier}, maxStdDev: ${sparkRendererInstance.maxStdDev}, lodScale: ${getDefaultLodRenderScale()})`)
      }

      // Detect file type from source URL using shared utility
      const srcUrl = node._src || url
      const ext = srcUrl ? detectSplatFormat(srcUrl) : null
      const fileType = ext ? getSparkFileType(ext) : null

      const isSOGS = fileType === 'pcsogs' || fileType === 'pcsogszip'
      const setupOptions = { node, matrix, color, opacity, splatScale, lodRenderScale }

      // SOGS/ZIP: Use URL-based loading (Spark.js handles decompression)
      if (isSOGS) {
        const splatMesh = new SplatMesh({
          url: url,
          fileType: fileType,
          lodRenderScale: lodRenderScale || getDefaultLodRenderScale()
        })

        const id = this._setupSplatMesh(splatMesh, setupOptions)

        // Monitor SOGS loading with cleanup on destroy
        let loadInterval = null
        if (!splatMesh.isInitialized) {
          let loadCheckCount = 0
          loadInterval = setInterval(() => {
            loadCheckCount++
            if (splatMesh.numSplats > 0 || splatMesh.isInitialized || loadCheckCount >= 30) {
              clearInterval(loadInterval)
              loadInterval = null
              if (loadCheckCount >= 30) {
                console.warn('⚠️ SOGS loading timeout - file may be corrupted or too large')
              }
            }
          }, 2000)
        }

        return this._createSplatHandle(splatMesh, { id, srcUrl: null, loadInterval })
      }

      // All other formats: Load via Hyperfy's asset system
      let splatData = this.world.loader.get('splat', srcUrl)
      if (!splatData) {
        splatData = await this.world.loader.load('splat', srcUrl)
      }

      const splatMesh = await splatData.createSplatMesh()
      const id = this._setupSplatMesh(splatMesh, setupOptions)

      return this._createSplatHandle(splatMesh, { id, srcUrl, removeFromCache: true })

    } catch (error) {
      console.error('❌ SplatMesh creation failed:', error)
      return null
    }
  }

  raycast(origin, direction, layers = this.maskNone, min = 0, max = Infinity) {
    if (!this.viewport) throw new Error('no viewport')
    vec2.x = 0
    vec2.y = 0
    this.raycaster.set(origin, direction)
    this.raycaster.layers = layers
    this.raycaster.near = min
    this.raycaster.far = max
    this.raycastHits.length = 0
    this.octree.raycast(this.raycaster, this.raycastHits)

    // Also raycast against SplatMeshes using Three.js standard raycasting
    this._raycastSplatMeshes(this.raycaster, this.raycastHits)

    return this.raycastHits
  }

  destroy() {
    this.models.clear()
    // Clean up splat meshes
    for (const [_id, splatMesh] of this.splatMeshes) {
      // Clear any associated intervals
      if (splatMesh._loadIntervalId) {
        clearInterval(splatMesh._loadIntervalId)
        splatMesh._loadIntervalId = null
      }
      this.scene.remove(splatMesh)
      if (splatMesh.dispose) {
        splatMesh.dispose()
      }
    }
    this.splatMeshes.clear()
  }
}

class Model {
  constructor(stage, geometry, material, uberShader, castShadow, receiveShadow) {
    material = stage.createMaterial({ raw: material })

    this.stage = stage
    this.geometry = geometry.clone() // important since uber shader needs unique buffer attributes
    this.material = material
    this.uberShader = uberShader
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

    // uber shader extends to support more per-instance properties like emissive, emissiveItensity and anything else in the future
    if (this.uberShader) {
      const prev = this.material.raw.onBeforeCompile
      // see: https://claude.ai/chat/b73be3e5-bb52-4da2-a47e-fbbf4f3eb54b
      this.material.raw.onBeforeCompile = function (shader) {
        prev?.(shader)
        shader.vertexShader = shader.vertexShader.replace(
          `#include <color_pars_vertex>`,
          `
          #include <color_pars_vertex>
          #ifdef USE_UBER_SHADER
            attribute vec3 instanceEmissive;
            attribute float instanceEmissiveIntensity;
            varying vec3 vInstanceEmissive;
          #endif
          `
        )
        shader.vertexShader = shader.vertexShader.replace(
          `#include <color_vertex>`,
          `
          #include <color_vertex>
          #ifdef USE_UBER_SHADER
            vInstanceEmissive = instanceEmissive * instanceEmissiveIntensity;
          #endif
          `
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          `#include <color_pars_fragment>`,
          `
          #include <color_pars_fragment>
          #ifdef USE_UBER_SHADER
            varying vec3 vInstanceEmissive;
          #endif
          `
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          `vec3 totalEmissiveRadiance = emissive;`,
          `
          vec3 totalEmissiveRadiance = emissive;
          #ifdef USE_UBER_SHADER
            totalEmissiveRadiance = vInstanceEmissive;
          #endif
          `
        )
      }
      this.material.raw.defines.USE_UBER_SHADER = ''
      this.material.raw.needsUpdate = true
    }
  }

  create(node, matrix) {
    const item = {
      idx: this.items.length,
      node,
      matrix,
      color: null,
      emissive: null,
      emissiveIntensity: null,
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
      setEmissive: value => {
        if (!item.emissive) item.emissive = new THREE.Color()
        item.emissive.set(value)
        this.iMesh.setEmissiveAt(item.idx, item.emissive)
        this.iMesh.instanceEmissive.needsUpdate = true
      },
      setEmissiveIntensity: value => {
        item.emissiveIntensity = value
        this.iMesh.setEmissiveIntensityAt(item.idx, item.emissiveIntensity)
        this.iMesh.instanceEmissiveIntensity.needsUpdate = true
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
      if (last.emissive) this.iMesh.setEmissiveAt(item.idx, last.emissive)
      if (last.emissiveIntensity || last.emissiveIntensity === 0) {
        this.iMesh.setEmissiveIntensityAt(item.idx, last.emissiveIntensity)
      }
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
        if (item.emissive) this.iMesh.setEmissiveAt(i, item.emissive)
        if (item.emissiveIntensity || item.emissiveIntensity === 0) {
          this.iMesh.setEmissiveIntensityAt(i, item.emissiveIntensity)
        }
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
    if (this.iMesh.instanceEmissive) {
      this.iMesh.instanceEmissive.needsUpdate = true
    }
    if (this.iMesh.instanceEmissiveIntensity) {
      this.iMesh.instanceEmissiveIntensity.needsUpdate = true
    }
    // this.iMesh.computeBoundingSphere()
    this.dirty = false
  }

  getEntity(instanceId) {
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
