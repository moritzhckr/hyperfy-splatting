import { isBoolean, isNumber, isString } from 'lodash-es'
import { Node } from './Node'

const defaults = {
  src: null,
  linked: false,
  castShadow: false,
  receiveShadow: false,
  sortMode: 'auto',
  color: '#ffffff',
  opacity: 1.0,
  splatScale: 1.0,
  lodRenderScale: 1.0, // NEW: LOD control - higher = more culling
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
    this._lodRenderScale = isNumber(data.lodRenderScale) ? Math.max(0.1, data.lodRenderScale) : defaults.lodRenderScale

    this.loadingState = 'idle' // 'idle', 'loading', 'loaded', 'error'
    this.needsRebuild = false
    this.handle = null
    this.handleCreationId = 0 // Unique ID for each handle creation attempt (prevents ghost splats)
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
    // Increment creation ID to invalidate any pending handle creation
    this.handleCreationId++

    // Destroy existing handle
    this.handle?.destroy()
    this.handle = null
  }

  async loadSplat() {
    if (this.loadingState === 'loading') return
    if (!this._src) return

    // Server doesn't need to load splats for rendering - just mark as loaded
    if (this.ctx.world.network.isServer) {
      this.loadingState = 'loaded'
      return
    }

    this.loadingState = 'loading'

    try {
      // Use Hyperfy's standard loader system
      const format = this._src.split('.').pop()?.toLowerCase()

      // For PLY/KSPLAT/SPLAT/SPZ: Use standard loader
      // SOGS and ZIP files are loaded directly via URL in Stage.js
      if (format === 'ply' || format === 'ksplat' || format === 'splat' || format === 'spz') {
        // Load through Hyperfy's asset system
        let splatData = this.ctx.world.loader.get('splat', this._src)
        if (!splatData) {
          splatData = await this.ctx.world.loader.load('splat', this._src)
        }
        // Store the loaded data for createSplatHandle
        this.splatData = splatData
      }

      this.loadingState = 'loaded'

      // Only create handle on client after loading is marked complete
      if (this.mounted && !this.ctx.world.network.isServer) {
        await this.createSplatHandle()
      }
    } catch (error) {
      console.error('❌ [GaussianSplat] Loading failed:', error)
      this.loadingState = 'error'
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

    // Determine URL to use based on loaded data or fallback
    let actualURL = this.ctx.world.resolveURL(this._src)

    // For formats handled by standard loader, use the loaded data if available
    const format = this._src.split('.').pop()?.toLowerCase()

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
    }

    // Create the splat handle (async operation)
    // Note: sortMode is not passed - Spark.js handles sorting internally via SparkRenderer
    const newHandle = await this.ctx.world.stage.insertGaussianSplat({
      url: actualURL,
      node: this,
      matrix: this.matrixWorld,
      color: this._color,
      opacity: this._opacity,
      splatScale: this._splatScale,
      lodRenderScale: this._lodRenderScale
    })

    // Check if this creation was invalidated while we were waiting
    if (creationId !== this.handleCreationId) {
      // This handle is stale - destroy it immediately to prevent ghost splat
      console.log('🗑️ [GaussianSplat] Destroying stale handle (creation invalidated)')
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
    this._lodRenderScale = source._lodRenderScale
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

  get castShadow() {
    return this._castShadow
  }

  set castShadow(value = defaults.castShadow) {
    if (!isBoolean(value)) {
      throw new Error('[gaussiansplat] castShadow must be a boolean')
    }
    if (this._castShadow === value) return
    this._castShadow = value
    if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
  }

  get receiveShadow() {
    return this._receiveShadow
  }

  set receiveShadow(value = defaults.receiveShadow) {
    if (!isBoolean(value)) {
      throw new Error('[gaussiansplat] receiveShadow must be a boolean')
    }
    if (this._receiveShadow === value) return
    this._receiveShadow = value
    if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
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

  get lodRenderScale() {
    return this._lodRenderScale
  }

  set lodRenderScale(value = defaults.lodRenderScale) {
    if (!isNumber(value)) {
      throw new Error('[gaussiansplat] lodRenderScale must be a number')
    }
    value = Math.max(0.1, value) // Minimum 0.1
    if (this._lodRenderScale === value) return
    this._lodRenderScale = value
    if (this.handle && this.handle.updateLodRenderScale) {
      this.handle.updateLodRenderScale(value)
    }
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
        get lodRenderScale() {
          return self.lodRenderScale
        },
        set lodRenderScale(value) {
          self.lodRenderScale = value
        },
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy()))
      this.proxy = proxy
    }
    return this.proxy
  }
}