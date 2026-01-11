import * as THREE from '../extras/three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'

import { System } from './System'
import { createNode } from '../extras/createNode'
import { createVRMFactory } from '../extras/createVRMFactory'
import { glbToNodes } from '../extras/glbToNodes'
import { createEmoteFactory } from '../extras/createEmoteFactory'
import { TextureLoader } from 'three'
import { formatBytes } from '../extras/formatBytes'
import { emoteUrls } from '../extras/playerEmotes'
import Hls from 'hls.js/dist/hls.js'

// THREE.Cache.enabled = true

/**
 * Client Loader System
 *
 * - Runs on the client
 * - Basic file loader for many different formats, cached.
 *
 */
export class ClientLoader extends System {
  constructor(world) {
    super(world)
    this.files = new Map()
    this.promises = new Map()
    this.results = new Map()
    this.rgbeLoader = new RGBELoader()
    this.texLoader = new TextureLoader()
    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.register(parser => new VRMLoaderPlugin(parser))
    this.preloadItems = []
  }

  start() {
    this.vrmHooks = {
      camera: this.world.camera,
      scene: this.world.stage.scene,
      octree: this.world.stage.octree,
      setupMaterial: this.world.setupMaterial,
      loader: this.world.loader,
    }
  }

  has(type, url) {
    const key = `${type}/${url}`
    return this.promises.has(key)
  }

  get(type, url) {
    const key = `${type}/${url}`
    return this.results.get(key)
  }

  preload(type, url) {
    this.preloadItems.push({ type, url })
  }

  execPreload() {
    let loadedItems = 0
    let totalItems = this.preloadItems.length
    let progress = 0
    const promises = this.preloadItems.map(item => {
      return this.load(item.type, item.url).then(() => {
        loadedItems++
        progress = (loadedItems / totalItems) * 100
        this.world.emit('progress', progress)
      })
    })
    this.preloader = Promise.allSettled(promises).then(() => {
      this.preloader = null
      // this.world.emit('ready', true)
    })
  }

  setFile(url, file) {
    this.files.set(url, file)
  }

  hasFile(url) {
    url = this.world.resolveURL(url)
    return this.files.has(url)
  }

  getFile(url, name) {
    url = this.world.resolveURL(url)
    const file = this.files.get(url)
    if (!file) return null
    if (name) {
      return new File([file], name, {
        type: file.type, // Preserve the MIME type
        lastModified: file.lastModified, // Preserve the last modified timestamp
      })
    }
    return file
  }

  remove(type, url) {
    const key = `${type}/${url}`
    console.log('🗑️ Removing from loader cache:', key)

    // For splats: Clean up memory-intensive fileBytes
    const result = this.results.get(key)
    if (result && result.fileBytes) {
      console.log('🧹 Cleaning up fileBytes memory:', (result.fileBytes.byteLength / 1024 / 1024).toFixed(2), 'MB')
      // Clear the ArrayBuffer reference to help GC
      result.fileBytes = null
    }

    // Remove from results cache
    this.results.delete(key)

    // Remove from files cache
    url = this.world.resolveURL(url)
    this.files.delete(url)

    // Remove from promises cache if it exists
    this.promises.delete(key)

    // Force garbage collection hint (not guaranteed but helps)
    if (globalThis.gc) {
      globalThis.gc()
    }

  }

  loadFile = async (url, options = {}) => {
    const { preserveCompression = false } = options

    url = this.world.resolveURL(url)
    const cacheKey = preserveCompression ? `${url}:raw` : url

    if (this.files.has(cacheKey)) {
      return this.files.get(cacheKey)
    }

    const fileName = url.split('/').pop()

    if (preserveCompression) {
      // Try different approaches to prevent auto-decompression

      // Approach 1: Try with compress: false and special headers
      try {
        const resp = await fetch(url, {
          compress: false,
          headers: {
            'Cache-Control': 'no-transform'
          }
        })


        const arrayBuffer = await resp.arrayBuffer()
        const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4))
        const isGzipped = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b


        if (isGzipped) {
          const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
          const file = new File([blob], fileName, { type: 'application/octet-stream' })
          this.files.set(cacheKey, file)
          return file
        }
      } catch (error) {
        console.warn('⚠️ compress: false approach failed:', error.message)
      }

      // Approach 2: Check for base64 encoding from server
      const resp = await fetch(url)
      const spzFormat = resp.headers.get('X-SPZ-Format')

      if (spzFormat === 'base64-gzip') {
        // Decode base64 to get original gzipped SPZ data
        const base64Data = await resp.text()

        // Convert base64 to binary data
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const blob = new Blob([bytes], { type: 'application/octet-stream' })
        const file = new File([blob], fileName, { type: 'application/octet-stream' })
        this.files.set(cacheKey, file)
        return file
      } else {
        // Fallback to normal handling
        const blob = await resp.blob()
        const file = new File([blob], fileName, { type: blob.type })
        this.files.set(cacheKey, file)
        return file
      }
    } else {
      // Normal fetch for other files
      const resp = await fetch(url)
      const blob = await resp.blob()
      const file = new File([blob], fileName, { type: blob.type })
      this.files.set(cacheKey, file)
      return file
    }
  }

  async load(type, url) {
    if (this.preloader) {
      await this.preloader
    }
    const key = `${type}/${url}`
    if (this.promises.has(key)) {
      return this.promises.get(key)
    }
    if (type === 'video') {
      const promise = new Promise(resolve => {
        url = this.world.resolveURL(url)
        const factory = createVideoFactory(this.world, url)
        resolve(factory)
      })
      this.promises.set(key, promise)
      return promise
    }
    // For SPZ files, use preserveCompression flag to maintain gzip format
    const loadFileOptions = (type === 'splat' && url.toLowerCase().endsWith('.spz')) ?
      { preserveCompression: true } : {}

    const promise = this.loadFile(url, loadFileOptions).then(async file => {
      if (type === 'hdr') {
        const buffer = await file.arrayBuffer()
        const result = this.rgbeLoader.parse(buffer)
        // we just mimicing what rgbeLoader.load() does behind the scenes
        const texture = new THREE.DataTexture(result.data, result.width, result.height)
        texture.colorSpace = THREE.LinearSRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        texture.flipY = true
        texture.type = result.type
        texture.needsUpdate = true
        this.results.set(key, texture)
        return texture
      }
      if (type === 'image') {
        return new Promise(resolve => {
          const img = new Image()
          img.onload = () => {
            this.results.set(key, img)
            resolve(img)
            // URL.revokeObjectURL(img.src)
          }
          img.src = URL.createObjectURL(file)
        })
      }
      if (type === 'texture') {
        return new Promise(resolve => {
          const img = new Image()
          img.onload = () => {
            const texture = this.texLoader.load(img.src)
            texture.colorSpace = THREE.SRGBColorSpace
            this.results.set(key, texture)
            resolve(texture)
            URL.revokeObjectURL(img.src)
          }
          img.src = URL.createObjectURL(file)
        })
      }
      if (type === 'model') {
        const buffer = await file.arrayBuffer()
        const glb = await this.gltfLoader.parseAsync(buffer)
        const node = glbToNodes(glb, this.world)
        const model = {
          toNodes() {
            return node.clone(true)
          },
          getStats() {
            const stats = node.getStats(true)
            // append file size
            stats.fileBytes = file.size
            return stats
          },
        }
        this.results.set(key, model)
        return model
      }
      if (type === 'emote') {
        const buffer = await file.arrayBuffer()
        const glb = await this.gltfLoader.parseAsync(buffer)
        const factory = createEmoteFactory(glb, url)
        const emote = {
          toClip(options) {
            return factory.toClip(options)
          },
        }
        this.results.set(key, emote)
        return emote
      }
      if (type === 'avatar') {
        const buffer = await file.arrayBuffer()
        const glb = await this.gltfLoader.parseAsync(buffer)
        const factory = createVRMFactory(glb, this.world.setupMaterial)
        const hooks = this.vrmHooks
        const node = createNode('group', { id: '$root' })
        const node2 = createNode('avatar', { id: 'avatar', factory, hooks })
        node.add(node2)
        const avatar = {
          factory,
          hooks,
          toNodes(customHooks) {
            const clone = node.clone(true)
            if (customHooks) {
              clone.get('avatar').hooks = customHooks
            }
            return clone
          },
          getStats() {
            const stats = node.getStats(true)
            // append file size
            stats.fileBytes = file.size
            return stats
          },
        }
        this.results.set(key, avatar)
        return avatar
      }
      if (type === 'script') {
        const code = await file.text()
        const script = this.world.scripts.evaluate(code)
        this.results.set(key, script)
        return script
      }
      if (type === 'audio') {
        const buffer = await file.arrayBuffer()
        const audioBuffer = await this.world.audio.ctx.decodeAudioData(buffer)
        this.results.set(key, audioBuffer)
        return audioBuffer
      }
      if (type === 'splat') {
        const format = file.name.split('.').pop().toLowerCase()
        console.log('📦 [ClientLoader] Loading splat file:', file.name, 'Format:', format, 'Size:', file.size)

        // For SPZ: Use fileBytes approach to avoid gzip conflicts
        if (format === 'spz') {
          console.log('🔵 [ClientLoader] Using SPZ-specific loading path')
          const fileBytes = await file.arrayBuffer()

          // Debug: Check the actual file data
          const firstBytes = new Uint8Array(fileBytes.slice(0, 10))
          const isGzipped = firstBytes[0] === 0x1f && firstBytes[1] === 0x8b

          // SPZ files are handled with fileBytes approach

          const createSplatMesh = async (options = {}) => {
            const { SplatMesh } = await import('@sparkjsdev/spark')

            console.log('🔧 [ClientLoader SPZ] Creating SplatMesh with fileBytes approach')
            console.log('   fileBytes length:', fileBytes.byteLength)
            console.log('   format:', format)

            // Convert fileBytes to Blob URL - onLoad callback works better with URLs
            const blob = new Blob([fileBytes], { type: 'application/octet-stream' })
            const blobUrl = URL.createObjectURL(blob)
            console.log('   Created blob URL:', blobUrl)

            // Wrap onLoad callback in a Promise to wait for loading
            return new Promise((resolve, reject) => {
              const splatMeshOptions = {
                url: blobUrl,  // Use URL instead of fileBytes
                fileType: format,
                // No scale override - use default
                onLoad: (mesh) => {
                  console.log('✅ [ClientLoader SPZ] onLoad callback fired! numSplats:', mesh.numSplats)
                  // Clean up blob URL
                  URL.revokeObjectURL(blobUrl)
                  resolve(mesh)
                },
                ...options
              }

              try {
                console.log('   Creating SplatMesh...')
                const splatMesh = new SplatMesh(splatMeshOptions)
                console.log('   SplatMesh created, waiting for onLoad...')

                // Safety timeout - if onLoad doesn't fire in 10 seconds, something is wrong
                setTimeout(() => {
                  if (splatMesh.numSplats === 0 && !splatMesh.isInitialized) {
                    console.warn('⚠️ [ClientLoader SPZ] onLoad not called after 10s, resolving anyway')
                    URL.revokeObjectURL(blobUrl)
                    resolve(splatMesh)
                  }
                }, 10000)
              } catch (error) {
                console.error('❌ [ClientLoader SPZ] SplatMesh creation failed:', error)
                URL.revokeObjectURL(blobUrl)
                reject(error)
              }
            })
          }

          const splatData = {
            file,
            url,
            fileBytes,
            size: file.size,
            format,
            createSplatMesh,
            getStats() {
              return {
                fileBytes: file.size,
                format
              }
            }
          }
          this.results.set(key, splatData)
          return splatData
        }

        // For other formats: Use fileBytes approach (same as SPZ but without compression handling)
        const fileBytes = await file.arrayBuffer()

        const createSplatMesh = async (options = {}) => {
          const { SplatMesh } = await import('@sparkjsdev/spark')

          console.log('🔧 [ClientLoader PLY] Creating SplatMesh with fileBytes approach')
          console.log('   fileBytes length:', fileBytes.byteLength)
          console.log('   format:', format)

          // Convert fileBytes to Blob URL - onLoad callback works better with URLs
          const blob = new Blob([fileBytes], { type: 'application/octet-stream' })
          const blobUrl = URL.createObjectURL(blob)
          console.log('   Created blob URL:', blobUrl)

          // Wrap onLoad callback in a Promise to wait for loading
          return new Promise((resolve, reject) => {
            const splatMeshOptions = {
              url: blobUrl,  // Use URL instead of fileBytes
              fileType: format,
              // No scale override - use default
              onLoad: (mesh) => {
                console.log('✅ [ClientLoader PLY] onLoad callback fired! numSplats:', mesh.numSplats)
                // Clean up blob URL
                URL.revokeObjectURL(blobUrl)
                resolve(mesh)
              },
              ...options
            }

            try {
              console.log('   Creating SplatMesh...')
              const splatMesh = new SplatMesh(splatMeshOptions)
              console.log('   SplatMesh created, waiting for onLoad...')

              // Safety timeout - if onLoad doesn't fire in 10 seconds, something is wrong
              setTimeout(() => {
                if (splatMesh.numSplats === 0 && !splatMesh.isInitialized) {
                  console.warn('⚠️ [ClientLoader PLY] onLoad not called after 10s, resolving anyway')
                  URL.revokeObjectURL(blobUrl)
                  resolve(splatMesh)
                }
              }, 10000)
            } catch (error) {
              console.error('❌ [ClientLoader PLY] SplatMesh creation failed:', error)
              URL.revokeObjectURL(blobUrl)
              reject(error)
            }
          })
        }

        const splatData = {
          file,
          url,
          fileBytes,
          size: file.size,
          format,
          createSplatMesh,
          getStats() {
            return {
              fileBytes: file.size,
              format
            }
          }
        }
        this.results.set(key, splatData)
        return splatData
      }
    })
    this.promises.set(key, promise)
    return promise
  }

  insert(type, url, file) {
    const key = `${type}/${url}`
    const localUrl = URL.createObjectURL(file)
    let promise
    if (type === 'hdr') {
      promise = this.rgbeLoader.loadAsync(localUrl).then(texture => {
        this.results.set(key, texture)
        return texture
      })
    }
    if (type === 'image') {
      promise = new Promise(resolve => {
        const img = new Image()
        img.onload = () => {
          this.results.set(key, img)
          resolve(img)
        }
        img.src = localUrl
      })
    }
    if (type === 'video') {
      promise = new Promise(resolve => {
        const factory = createVideoFactory(this.world, localUrl)
        resolve(factory)
      })
    }
    if (type === 'texture') {
      promise = this.texLoader.loadAsync(localUrl).then(texture => {
        this.results.set(key, texture)
        return texture
      })
    }
    if (type === 'model') {
      promise = this.gltfLoader.loadAsync(localUrl).then(glb => {
        const node = glbToNodes(glb, this.world)
        const model = {
          toNodes() {
            return node.clone(true)
          },
          getStats() {
            const stats = node.getStats(true)
            // append file size
            stats.fileBytes = file.size
            return stats
          },
        }
        this.results.set(key, model)
        return model
      })
    }
    if (type === 'emote') {
      promise = this.gltfLoader.loadAsync(localUrl).then(glb => {
        const factory = createEmoteFactory(glb, url)
        const emote = {
          toClip(options) {
            return factory.toClip(options)
          },
        }
        this.results.set(key, emote)
        return emote
      })
    }
    if (type === 'avatar') {
      promise = this.gltfLoader.loadAsync(localUrl).then(glb => {
        const factory = createVRMFactory(glb, this.world.setupMaterial)
        const hooks = this.vrmHooks
        const node = createNode('group', { id: '$root' })
        const node2 = createNode('avatar', { id: 'avatar', factory, hooks })
        node.add(node2)
        const avatar = {
          factory,
          hooks,
          toNodes(customHooks) {
            const clone = node.clone(true)
            if (customHooks) {
              clone.get('avatar').hooks = customHooks
            }
            return clone
          },
          getStats() {
            const stats = node.getStats(true)
            // append file size
            stats.fileBytes = file.size
            return stats
          },
        }
        this.results.set(key, avatar)
        return avatar
      })
    }
    if (type === 'script') {
      promise = new Promise(async (resolve, reject) => {
        try {
          const code = await file.text()
          const script = this.world.scripts.evaluate(code)
          this.results.set(key, script)
          resolve(script)
        } catch (err) {
          reject(err)
        }
      })
    }
    if (type === 'audio') {
      promise = new Promise(async (resolve, reject) => {
        try {
          const arrayBuffer = await file.arrayBuffer()
          const audioBuffer = await this.world.audio.ctx.decodeAudioData(arrayBuffer)
          this.results.set(key, audioBuffer)
          resolve(audioBuffer)
        } catch (err) {
          reject(err)
        }
      })
    }
    if (type === 'splat') {
      // Store the file directly for hasFile/getFile to work
      this.files.set(url, file)
      
      // For splat files, create the same structure as load() method
      promise = Promise.resolve().then(async () => {
        const format = file.name.split('.').pop().toLowerCase()

        // For SPZ: Use fileBytes approach to avoid gzip conflicts
        if (format === 'spz') {
          const fileBytes = await file.arrayBuffer()

          const createSplatMesh = async (options = {}) => {
            const { SplatMesh } = await import('@sparkjsdev/spark')

            // CRITICAL FIX: Force 10x scale to avoid float precision artifacts
            const PRECISION_SCALE = 10.0

            const splatMeshOptions = {
              fileBytes: fileBytes,
              fileType: format,
              fileName: file.name,
              scale: PRECISION_SCALE, // Force larger scale
              ...options
            }


            const splatMesh = new SplatMesh(splatMeshOptions)

            return splatMesh
          }

          const splatData = {
            file,
            url,
            fileBytes,
            size: file.size,
            format,
            createSplatMesh,
            getStats() {
              return {
                fileBytes: file.size,
                format
              }
            }
          }
          this.results.set(key, splatData)
          return splatData
        }

        // For other formats: Use fileBytes approach (same as SPZ but without compression handling)
        const fileBytes = await file.arrayBuffer()

        const createSplatMesh = async (options = {}) => {
          const { SplatMesh } = await import('@sparkjsdev/spark')

          // CRITICAL FIX: Force 10x scale to avoid float precision artifacts
          const PRECISION_SCALE = 10.0

          const splatMeshOptions = {
            fileBytes: fileBytes,
            fileType: format,
            fileName: file.name,
            scale: PRECISION_SCALE, // Force larger scale
            ...options
          }


          const splatMesh = new SplatMesh(splatMeshOptions)

          return splatMesh
        }

        const splatData = {
          file,
          url,
          fileBytes,
          size: file.size,
          format,
          createSplatMesh,
          getStats() {
            return {
              fileBytes: file.size,
              format
            }
          }
        }
        this.results.set(key, splatData)
        return splatData
      })
    }
    this.promises.set(key, promise)
  }

  destroy() {
    this.files.clear()
    this.promises.clear()
    this.results.clear()
    this.preloadItems = []
  }
}

function createVideoFactory(world, url) {
  const isHLS = url?.endsWith('.m3u8')
  const sources = {}
  let width
  let height
  let duration
  let ready = false
  let prepare
  function createSource(key) {
    const elem = document.createElement('video')
    elem.crossOrigin = 'anonymous'
    elem.playsInline = true
    elem.loop = false
    elem.muted = true
    elem.style.width = '1px'
    elem.style.height = '1px'
    elem.style.position = 'absolute'
    elem.style.opacity = '0'
    elem.style.zIndex = '-1000'
    elem.style.pointerEvents = 'none'
    elem.style.overflow = 'hidden'
    const needsPolyfill = isHLS && !elem.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()
    if (needsPolyfill) {
      const hls = new Hls()
      hls.loadSource(url)
      hls.attachMedia(elem)
    } else {
      elem.src = url
    }
    const audio = world.audio.ctx.createMediaElementSource(elem)
    let n = 0
    let dead
    world.audio.ready(() => {
      if (dead) return
      elem.muted = false
    })
    // set linked=false to have a separate source (and texture)
    const texture = new THREE.VideoTexture(elem)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.anisotropy = world.graphics.maxAnisotropy
    if (!prepare) {
      prepare = (function () {
        /**
         *
         * A regular video will load data automatically BUT a stream
         * needs to hit play() before it gets that data.
         *
         * The following code handles this for us, and when streaming
         * will hit play just until we get the data needed, then pause.
         */
        return new Promise(async resolve => {
          let playing = false
          let data = false
          elem.addEventListener(
            'loadeddata',
            async () => {
              // if we needed to hit play to fetch data then revert back to paused
              if (playing) elem.pause()
              data = true
              // await new Promise(resolve => setTimeout(resolve, 2000))
              width = elem.videoWidth
              height = elem.videoHeight
              duration = elem.duration
              ready = true
              resolve()
            },
            { once: true }
          )
          elem.addEventListener(
            'loadedmetadata',
            async () => {
              // we need a gesture before we can potentially hit play
              // await this.engine.driver.gesture
              // if we already have data do nothing, we're done!
              if (data) return
              // otherwise hit play to force data loading for streams
              elem.play()
              playing = true
            },
            { once: true }
          )
        })
      })()
    }
    function isPlaying() {
      return elem.currentTime > 0 && !elem.paused && !elem.ended && elem.readyState > 2
    }
    function play(restartIfPlaying = false) {
      if (restartIfPlaying) elem.currentTime = 0
      elem.play()
    }
    function pause() {
      elem.pause()
    }
    function stop() {
      elem.currentTime = 0
      elem.pause()
    }
    function release() {
      n--
      if (n === 0) {
        stop()
        audio.disconnect()
        texture.dispose()
        document.body.removeChild(elem)
        delete sources[key]
        // help to prevent chrome memory leaks
        // see: https://github.com/facebook/react/issues/15583#issuecomment-490912533
        elem.src = ''
        elem.load()
      }
    }
    const handle = {
      elem,
      audio,
      texture,
      prepare,
      get ready() {
        return ready
      },
      get width() {
        return width
      },
      get height() {
        return height
      },
      get duration() {
        return duration
      },
      get loop() {
        return elem.loop
      },
      set loop(value) {
        elem.loop = value
      },
      get isPlaying() {
        return isPlaying()
      },
      get currentTime() {
        return elem.currentTime
      },
      set currentTime(value) {
        elem.currentTime = value
      },
      play,
      pause,
      stop,
      release,
    }
    return {
      createHandle() {
        n++
        if (n === 1) {
          document.body.appendChild(elem)
        }
        return handle
      },
    }
  }
  return {
    get(key) {
      let source = sources[key]
      if (!source) {
        source = createSource(key)
        sources[key] = source
      }
      return source.createHandle()
    },
  }
}
