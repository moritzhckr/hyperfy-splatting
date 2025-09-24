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

    this.loadingState = 'idle' // 'idle', 'loading', 'loaded', 'error'
    this.needsRebuild = false
    this.handle = null
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
      // Resolve URL through Hyperfy's asset system
      const resolvedURL = this.ctx.world.resolveURL(this._src)
      
      this.loadingState = 'loaded'
      
      // Only create handle on client after loading is marked complete
      if (this.mounted && !this.ctx.world.network.isServer) {
        await this.createSplatHandle()
      }
    } catch (error) {
      console.error('❌ GaussianSplat loading failed:', error)
      this.loadingState = 'error'
    }
  }

  async createSplatHandle() {
    if (!this._src || !this.ctx?.world?.stage) {
      return
    }
    
    // Only create SplatMesh on client
    if (this.ctx.world.network.isServer) {
      return
    }

    // Try to use cached file first, fallback to resolved URL
    let actualURL = this.ctx.world.resolveURL(this._src)
    
    if (this.ctx.world.loader.hasFile(this._src)) {
      const cachedFile = this.ctx.world.loader.getFile(this._src)
      if (cachedFile) {
        actualURL = URL.createObjectURL(cachedFile)
      }
    } else {
      // For HTTP URLs, verify the asset exists before trying to load
      if (actualURL.includes('/assets/')) {
        try {
          const response = await fetch(actualURL, { method: 'HEAD' })
          if (!response.ok) {
            console.warn('⚠️ Splat asset not found on server:', actualURL)
            
            // Fallback: Try to use cached file
            const originalSrc = this.data?.src || this.data?.url || this._src
            if (originalSrc && this.ctx.world.loader.hasFile(originalSrc)) {
              const cachedFile = this.ctx.world.loader.getFile(originalSrc)
              if (cachedFile) {
                actualURL = URL.createObjectURL(cachedFile)
              } else {
                console.error('❌ No cached file available')
                this.loadingState = 'error'
                return
              }
            } else {
              console.error('❌ No fallback available')
              this.loadingState = 'error'
              return
            }
          }
        } catch (error) {
          console.error('❌ Failed to check splat asset availability:', error)
          // Continue with the URL anyway - might work
        }
      }
    }
    
    this.handle = await this.ctx.world.stage.insertGaussianSplat({
      url: actualURL,
      node: this,
      matrix: this.matrixWorld,
      sortMode: this._sortMode,
      color: this._color,
      opacity: this._opacity
    })
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


  get sortMode() {
    return this._sortMode
  }

  set sortMode(value = defaults.sortMode) {
    if (!sortModes.includes(value)) {
      throw new Error('[gaussiansplat] sortMode must be one of: ' + sortModes.join(', '))
    }
    if (this._sortMode === value) return
    this._sortMode = value
    if (this.handle && this.handle.updateSortMode) {
      this.handle.updateSortMode(value)
    } else if (this.handle) {
      this.needsRebuild = true
      this.setDirty()
    }
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
      }
      proxy = Object.defineProperties(proxy, Object.getOwnPropertyDescriptors(super.getProxy()))
      this.proxy = proxy
    }
    return this.proxy
  }
}