import { isBoolean, isNumber, isString } from 'lodash-es'
import { Node } from './Node'
import { detectSplatFormat } from '../utils/splatFormats'
import { createNode } from '../extras/createNode'

const defaults = {
  src: null,
  linked: false,
  castShadow: false,
  receiveShadow: false,
  sortMode: 'auto',
  color: '#ffffff',
  opacity: 1.0,
  splatScale: 1.0,
  lodSplatScale: 1.0, // Spark 2.0: LOD budget multiplier (0.5 = half, 1.0 = full, 2.0 = double)
}

const sortModes = ['auto', 'distance', 'none']

export class GaussianSplat extends Node {
  constructor(data = {}) {
    super(data)
    this.name = 'gaussiansplat'

    this._src = data.src || defaults.src
    this._linked = isBoolean(data.linked) ? data.linked : defaults.linked
    this._castShadow = isBoolean(data.castShadow) ? data.castShadow : defaults.castShadow
    this._receiveShadow = isBoolean(data.receiveShadow) ? data.receiveShadow : defaults.receiveShadow
    this._sortMode = sortModes.includes(data.sortMode) ? data.sortMode : defaults.sortMode
    this._color = isString(data.color) ? data.color : defaults.color
    this._opacity = isNumber(data.opacity) ? Math.max(0, Math.min(1, data.opacity)) : defaults.opacity
    this._splatScale = isNumber(data.splatScale) ? data.splatScale : defaults.splatScale
    this._lodSplatScale = isNumber(data.lodSplatScale) ? Math.max(0.1, data.lodSplatScale) : defaults.lodSplatScale

    this.loadingState = 'idle' // 'idle', 'loading', 'loaded', 'error'
    this.loadingProgress = 0
    this.needsRebuild = false
    this.handle = null
    this.handleCreationId = 0 // Unique ID for each handle creation attempt (prevents ghost splats)
    this.loadRequestId = 0 // Unique ID for each loadSplat call (newer calls supersede older ones)

    // Loading UI elements
    this.loadingUI = null
    this.loadingText = null
    this.loadingStartTime = null
  }

  mount() {
    this.needsRebuild = false
    if (this._src && !this._linked) {
      this.loadSplat()
    } else if (this._linked) {
      this.createSplatHandle() // Don't await in mount to avoid blocking
    }
  }

  commit(didMove) {
    if (this.needsRebuild) {
      this.unmount()
      this.mount()
      return
    }
    if (didMove && this.handle) {
      this.handle.move(this.matrixWorld)
    }
  }

  unmount() {
    // Invalidate any pending handle creation and in-flight loads
    this.handleCreationId++
    this.loadRequestId++

    // Remove loading UI
    this._removeLoadingUI()

    // Destroy existing handle
    this.handle?.destroy()
    this.handle = null
  }

  _createLoadingUI() {
    if (this.loadingUI || this.ctx.world.network.isServer) return

    this.loadingStartTime = Date.now()

    // Create UI container with billboard
    this.loadingUI = createNode('ui', {
      width: 160,
      height: 120,
      size: 0.008,
      position: [0, 1.5, 0],
      billboard: 'y',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: [0, 0, 2, 0],
    })

    // Create bubble background
    const bubble = createNode('uiview', {
      backgroundColor: 'rgba(0,0,0,0.9)',
      borderRadius: 12,
      padding: 12,
      flexDirection: 'column',
      alignItems: 'center',
    })

    // Create title text
    const title = createNode('uitext', {
      value: 'Loading Splat',
      fontSize: 12,
      fontWeight: 500,
      color: 'white',
      textAlign: 'center',
      margin: [0, 0, 6, 0],
    })

    // Create progress text
    this.loadingText = createNode('uitext', {
      value: '0%',
      fontSize: 10,
      fontWeight: 300,
      color: 'rgba(255,255,255,0.7)',
      textAlign: 'center',
    })

    bubble.add(title)
    bubble.add(this.loadingText)
    this.loadingUI.add(bubble)

    // Create line
    const line = createNode('uiview', {
      width: 1,
      backgroundColor: 'rgba(255,255,255,0.5)',
      flexGrow: 1,
    })
    this.loadingUI.add(line)

    // Create dot
    const dot = createNode('uiview', {
      width: 4,
      height: 4,
      borderRadius: 4,
      backgroundColor: 'white',
    })
    this.loadingUI.add(dot)

    // Add to this node
    this.add(this.loadingUI)
    if (this.ctx) {
      this.loadingUI.activate(this.ctx)
    }
  }

  _updateLoadingUI(progress) {
    if (!this.loadingText) return
    this.loadingProgress = progress
    const elapsed = ((Date.now() - this.loadingStartTime) / 1000).toFixed(0)
    this.loadingText.value = `${Math.round(progress * 100)}% · ${elapsed}s`
  }

  _removeLoadingUI() {
    if (this.loadingUI) {
      this.loadingUI.deactivate()
      this.remove(this.loadingUI)
      this.loadingUI = null
      this.loadingText = null
      this.loadingStartTime = null
    }
  }

  async loadSplat() {
    if (!this._src) return

    // Server doesn't need to load splats for rendering - just mark as loaded
    if (this.ctx.world.network.isServer) {
      this.loadingState = 'loaded'
      return
    }

    // Each call supersedes any in-flight load (e.g. src changed while loading)
    const loadId = ++this.loadRequestId
    const src = this._src

    this.loadingState = 'loading'
    this._createLoadingUI()

    try {
      const format = detectSplatFormat(src)

      // For PLY/KSPLAT/SPLAT/SPZ: warm the loader cache so Stage picks it up
      // SOGS and ZIP files are loaded directly via URL in Stage.js
      if (format === 'ply' || format === 'ksplat' || format === 'splat' || format === 'spz') {
        if (!this.ctx.world.loader.get('splat', src)) {
          await this.ctx.world.loader.load('splat', src)
        }
      }

      if (loadId !== this.loadRequestId) return // superseded

      this.loadingState = 'loaded'

      // Only create handle on client after loading is marked complete
      if (this.mounted) {
        await this.createSplatHandle()
      }

      if (loadId !== this.loadRequestId) return // superseded

      // Remove loading UI after handle is created
      this._removeLoadingUI()
    } catch (error) {
      if (loadId !== this.loadRequestId) return // superseded
      console.error('❌ [GaussianSplat] Loading failed:', error)
      this.loadingState = 'error'
      this._removeLoadingUI()
    }
  }

  async createSplatHandle() {
    if (!this._src || !this.ctx?.world?.stage) return

    // Only create SplatMesh on client
    if (this.ctx.world.network.isServer) return

    // Destroy existing handle before creating new one
    if (this.handle) {
      this.handle.destroy()
      this.handle = null
    }

    // Track this creation attempt with unique ID
    const creationId = ++this.handleCreationId

    // Stage resolves the asset itself: SOGS/ZIP formats load via this URL,
    // all other formats load through the loader cache keyed by node._src.
    const url = this.ctx.world.resolveURL(this._src)

    // Note: sortMode is not passed - Spark.js handles sorting internally via SparkRenderer
    const newHandle = await this.ctx.world.stage.insertGaussianSplat({
      url,
      node: this,
      matrix: this.matrixWorld,
      color: this._color,
      opacity: this._opacity,
      splatScale: this._splatScale,
      onProgress: (event) => {
        if (event.lengthComputable) {
          this._updateLoadingUI(event.loaded / event.total)
        }
      }
    })

    // Check if this creation was invalidated while we were waiting
    if (creationId !== this.handleCreationId) {
      newHandle?.destroy()
      return
    }

    // Assign the handle
    this.handle = newHandle
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this._src = source._src
    this._linked = source._linked
    this._castShadow = source._castShadow
    this._receiveShadow = source._receiveShadow
    this._sortMode = source._sortMode
    this._color = source._color
    this._opacity = source._opacity
    this._splatScale = source._splatScale
    this._lodSplatScale = source._lodSplatScale
    this.loadingState = source.loadingState
    return this
  }

  // Property getters and setters
  get src() {
    return this._src
  }

  set src(value) {
    if (!isString(value) && value !== null) {
      throw new Error('[gaussiansplat] src must be a string or null')
    }
    if (this._src === value) return
    this._src = value
    if (this.mounted && !this._linked) {
      this.loadSplat()
    }
  }

  get linked() {
    return this._linked
  }

  set linked(value = defaults.linked) {
    if (!isBoolean(value)) {
      throw new Error('[gaussiansplat] linked must be a boolean')
    }
    if (this._linked === value) return
    this._linked = value
    this.needsRebuild = true
    this.setDirty()
  }

  // Note: castShadow/receiveShadow are kept for API compatibility but have no
  // effect - Spark splat meshes don't participate in the three.js shadow pass
  get castShadow() {
    return this._castShadow
  }

  set castShadow(value = defaults.castShadow) {
    if (!isBoolean(value)) {
      throw new Error('[gaussiansplat] castShadow must be a boolean')
    }
    this._castShadow = value
  }

  get receiveShadow() {
    return this._receiveShadow
  }

  set receiveShadow(value = defaults.receiveShadow) {
    if (!isBoolean(value)) {
      throw new Error('[gaussiansplat] receiveShadow must be a boolean')
    }
    this._receiveShadow = value
  }


  // Note: sortMode is kept for backwards compatibility but has no effect
  // Spark.js handles sorting internally via SparkRenderer
  get sortMode() {
    return this._sortMode
  }

  set sortMode(value = defaults.sortMode) {
    if (!sortModes.includes(value)) {
      throw new Error('[gaussiansplat] sortMode must be one of: ' + sortModes.join(', '))
    }
    if (this._sortMode === value) return
    this._sortMode = value
    // Note: Spark.js does not support sortMode - sorting is handled automatically
  }

  get color() {
    return this._color
  }

  set color(value = defaults.color) {
    if (!isString(value)) {
      throw new Error('[gaussiansplat] color must be a string')
    }
    if (this._color === value) return
    this._color = value
    if (this.handle && this.handle.updateColor) {
      this.handle.updateColor(value)
    }
  }

  get opacity() {
    return this._opacity
  }

  set opacity(value = defaults.opacity) {
    if (!isNumber(value)) {
      throw new Error('[gaussiansplat] opacity must be a number')
    }
    value = Math.max(0, Math.min(1, value))
    if (this._opacity === value) return
    this._opacity = value
    if (this.handle && this.handle.updateOpacity) {
      this.handle.updateOpacity(value)
    }
  }

  get splatScale() {
    return this._splatScale
  }

  set splatScale(value = defaults.splatScale) {
    if (!isNumber(value)) {
      throw new Error('[gaussiansplat] splatScale must be a number')
    }
    if (this._splatScale === value) return
    this._splatScale = value
    if (this.handle && this.handle.updateSplatScale) {
      this.handle.updateSplatScale(value)
    } else if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
  }

  // Spark 2.0: lodSplatScale is a GLOBAL setting on the SparkRenderer, not
  // per-splat. Setting it on any node changes the LOD budget for all splats
  // in the world (last writer wins). The getter reflects the global value.
  get lodSplatScale() {
    return this.ctx?.world?.stage?.getLodSplatScale?.() || this._lodSplatScale
  }

  set lodSplatScale(value = defaults.lodSplatScale) {
    if (!isNumber(value)) {
      throw new Error('[gaussiansplat] lodSplatScale must be a number')
    }
    value = Math.max(0.1, value)
    this._lodSplatScale = value
    this.ctx?.world?.stage?.setLodSplatScale?.(value)
  }



  getProxy() {
    if (!this.proxy) {
      const self = this
      let proxy = {
        get src() {
          return self.src
        },
        set src(value) {
          self.src = value
        },
        get linked() {
          return self.linked
        },
        set linked(value) {
          self.linked = value
        },
        get castShadow() {
          return self.castShadow
        },
        set castShadow(value) {
          self.castShadow = value
        },
        get receiveShadow() {
          return self.receiveShadow
        },
        set receiveShadow(value) {
          self.receiveShadow = value
        },
        get sortMode() {
          return self.sortMode
        },
        set sortMode(value) {
          self.sortMode = value
        },
        get loadingState() {
          return self.loadingState
        },
        get color() {
          return self.color
        },
        set color(value) {
          self.color = value
        },
        get opacity() {
          return self.opacity
        },
        set opacity(value) {
          self.opacity = value
        },
        get splatScale() {
          return self.splatScale
        },
        set splatScale(value) {
          self.splatScale = value
        },
        get lodSplatScale() {
          return self.lodSplatScale
        },
        set lodSplatScale(value) {
          self.lodSplatScale = value
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy()))
      this.proxy = proxy
    }
    return this.proxy
  }
}