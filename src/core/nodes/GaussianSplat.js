import { isBoolean, isNumber, isString } from 'lodash-es'
import { Node } from './Node'

const defaults = {
  src: null,
  linked: false,
  castShadow: false,
  receiveShadow: false,
  splatScale: 1.0,
  opacity: 1.0,
  sphericalHarmonics: true,
  sortMode: 'auto',
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
    this._splatScale = isNumber(data.splatScale) ? data.splatScale : defaults.splatScale
    this._opacity = isNumber(data.opacity) ? data.opacity : defaults.opacity
    this._sphericalHarmonics = isBoolean(data.sphericalHarmonics) ? data.sphericalHarmonics : defaults.sphericalHarmonics
    this._sortMode = sortModes.includes(data.sortMode) ? data.sortMode : defaults.sortMode

    this.loadingState = 'idle' // 'idle', 'loading', 'loaded', 'error'
    this.needsRebuild = false
    this.handle = null
  }

  mount() {
    this.needsRebuild = false
    if (this._src && !this._linked) {
      this.loadSplat()
    } else if (this._linked) {
      this.createSplatHandle()
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
    this.handle?.destroy()
    this.handle = null
  }

  async loadSplat() {
    if (this.loadingState === 'loading') return
    if (!this._src) return

    // Server doesn't need to load splats for rendering
    if (this.ctx.world.isServer) {
      this.loadingState = 'loaded'
      return
    }

    this.loadingState = 'loading'
    
    try {
      console.log('🔥 Loading Gaussian Splat with Spark.js:', this._src)
      
      // Resolve URL through Hyperfy's asset system
      const resolvedURL = this.ctx.world.resolveURL(this._src)
      console.log('📁 Resolved URL:', resolvedURL)
      
      this.loadingState = 'loaded'
      
      if (this.mounted) {
        this.createSplatHandle()
      }
    } catch (error) {
      console.error('❌ GaussianSplat loading failed:', error)
      this.loadingState = 'error'
    }
  }

  createSplatHandle() {
    if (!this._src || !this.ctx?.world?.stage) return

    // Resolve URL for Spark.js
    const resolvedURL = this.ctx.world.resolveURL(this._src)
    
    this.handle = this.ctx.world.stage.insertGaussianSplat({
      url: resolvedURL,
      node: this,
      matrix: this.matrixWorld,
      splatScale: this._splatScale,
      opacity: this._opacity,
      sphericalHarmonics: this._sphericalHarmonics,
      sortMode: this._sortMode
    })
  }

  copy(source, recursive) {
    super.copy(source, recursive)
    this._src = source._src
    this._linked = source._linked
    this._castShadow = source._castShadow
    this._receiveShadow = source._receiveShadow
    this._splatScale = source._splatScale
    this._opacity = source._opacity
    this._sphericalHarmonics = source._sphericalHarmonics
    this._sortMode = source._sortMode
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

  get splatScale() {
    return this._splatScale
  }

  set splatScale(value = defaults.splatScale) {
    if (!isNumber(value) || value <= 0) {
      throw new Error('[gaussiansplat] splatScale must be a positive number')
    }
    if (this._splatScale === value) return
    this._splatScale = value
    if (this.handle && this.handle.updateScale) {
      this.handle.updateScale(value)
    } else if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
  }

  get opacity() {
    return this._opacity
  }

  set opacity(value = defaults.opacity) {
    if (!isNumber(value) || value < 0 || value > 1) {
      throw new Error('[gaussiansplat] opacity must be a number between 0 and 1')
    }
    if (this._opacity === value) return
    this._opacity = value
    if (this.handle && this.handle.updateOpacity) {
      this.handle.updateOpacity(value)
    } else if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
  }

  get sphericalHarmonics() {
    return this._sphericalHarmonics
  }

  set sphericalHarmonics(value = defaults.sphericalHarmonics) {
    if (!isBoolean(value)) {
      throw new Error('[gaussiansplat] sphericalHarmonics must be a boolean')
    }
    if (this._sphericalHarmonics === value) return
    this._sphericalHarmonics = value
    if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
  }

  get sortMode() {
    return this._sortMode
  }

  set sortMode(value = defaults.sortMode) {
    if (!sortModes.includes(value)) {
      throw new Error('[gaussiansplat] sortMode must be one of: ' + sortModes.join(', '))
    }
    if (this._sortMode === value) return
    this._sortMode = value
    if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
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
        get splatScale() {
          return self.splatScale
        },
        set splatScale(value) {
          self.splatScale = value
        },
        get opacity() {
          return self.opacity
        },
        set opacity(value) {
          self.opacity = value
        },
        get sphericalHarmonics() {
          return self.sphericalHarmonics
        },
        set sphericalHarmonics(value) {
          self.sphericalHarmonics = value
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
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy()))
      this.proxy = proxy
    }
    return this.proxy
  }
}