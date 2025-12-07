/**
 * ThatOpen IFC Loader Wrapper
 * 
 * Wraps ThatOpen Components IFC loading functionality
 * to integrate with Hyperfy's existing loader system
 * 
 * ThatOpen Components uses a fragments-based system for efficient IFC rendering.
 * We need to convert this to Hyperfy's node structure while preserving metadata.
 */

import * as THREE from '../extras/three'
import * as OBC from '@thatopen/components'

export class ThatOpenIFCLoader {
  constructor() {
    // Initialize ThatOpen Components
    this.components = new OBC.Components()
    this.components.init()
    
    // Get required managers from components
    this.ifcLoader = this.components.get(OBC.IfcLoader)
    this.fragmentsManager = this.components.get(OBC.FragmentsManager)
    
    // Initialize FragmentsManager with worker
    const workerUrl = '/worker.mjs'
    this.fragmentsManager.init(workerUrl)
    console.log('[ThatOpen IFC] FragmentsManager initialized with local worker:', workerUrl)
    
    // Setup IFC Loader
    this.setupPromise = this.setup()
  }

  async setup() {
      // Check if WASM files are accessible
      try {
        const wasmTest = await fetch('/web-ifc.wasm', { method: 'HEAD' })
        if (!wasmTest.ok) {
          console.warn('[ThatOpen IFC] WASM file not accessible at /web-ifc.wasm')
        }
      } catch (e) {
        console.warn('[ThatOpen IFC] Could not check WASM file:', e)
      }
      
    // Setup with explicit WASM path
      try {
      await this.ifcLoader.setup({
        autoSetWasm: false,
          wasm: {
          path: '/',
            absolute: false,
          }
        })
        console.log('[ThatOpen IFC] Setup completed successfully')
      } catch (setupErr) {
      console.warn('[ThatOpen IFC] Setup failed, trying with autoSetWasm:', setupErr)
      await this.ifcLoader.setup({
          autoSetWasm: true,
        })
      }
  }

  /**
   * Load IFC file and return a Three.js Mesh/Group
   */
  async loadAsync(url) {
    try {
      // Ensure setup is complete before loading
      if (this.setupPromise) {
          await this.setupPromise
        this.setupPromise = null
      }
      
      console.log('[ThatOpen IFC] Fetching IFC file:', url)
      const response = await fetch(url)
      const buffer = await response.arrayBuffer()
      const typedArray = new Uint8Array(buffer)
      
      // Extract filename
      let filename = 'IFC Model'
      try {
        const urlObj = new URL(url)
        filename = urlObj.pathname.split('/').pop() || 'IFC Model'
      } catch (e) {
        // Ignore
      }

      // Step 1: Read IFC file (parsing)
      console.log('[ThatOpen IFC] Reading IFC file...')
      const webIfcModelID = await this.ifcLoader.readIfcFile(typedArray)
      console.log('[ThatOpen IFC] Read IFC file, webIfc ID:', webIfcModelID)
      
      // Step 2: Start loading process
      console.log('[ThatOpen IFC] Loading fragments...')
      // FIX: Catch errors immediately to prevent SES crash
      // We don't await this because we rely on the event listener for the full ready state (geometry)
      this.ifcLoader.load(typedArray, true, filename).catch(err => {
        console.error('[ThatOpen IFC] Internal load process failed:', err)
      })
      
      // Step 3: Wait for fragment to be ready via Event
      // Note: fragmentsModel.modelId might be a UUID string, while webIfcModelID is a number
      const fragmentsModel = await this.waitForFragment(webIfcModelID, filename)
      
      // Process metadata (IDs, Types)
      // CRITICAL: Pass webIfcModelID (number) for querying web-ifc, as fragmentsModel.modelId is likely a UUID string
      await this.processModelMetadata(fragmentsModel, webIfcModelID)

      // Convert to Three.js Group
      const group = new THREE.Group()
      group.modelID = fragmentsModel.modelId
      
      if (fragmentsModel.object) {
        group.add(fragmentsModel.object)
            } else {
        throw new Error('No Three.js object found in FragmentsModel')
      }

      // Store useful data in userData
      group.userData = {
        ifcModelID: fragmentsModel.modelId,
        fragmentsModel: fragmentsModel,
        thatOpenComponents: this.components,
        // Transfer processed metadata
        ifcTypeStats: fragmentsModel.userData.ifcTypeStats,
        ifcExpressIDToType: fragmentsModel.userData.ifcExpressIDToType,
      }
      
      return group
    } catch (err) {
      console.error('[ThatOpen IFC] Error loading IFC:', err)
      throw err
    }
  }

  /**
   * Wait for fragment to be loaded and ready (Geometry loaded)
   */
  async waitForFragment(modelID, filename) {
    return new Promise((resolve, reject) => {
      let checkInterval = null
      
      const cleanup = () => {
        this.fragmentsManager.list.onItemSet.remove(checkFragment)
        if (checkInterval) clearInterval(checkInterval)
        clearTimeout(timeout)
      }

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Fragment load timeout'))
      }, 300000)

      const isGeometryReady = (model) => {
        return model.object && (
          model.object.children?.length > 0 || 
          model.tiles?.size > 0
        )
      }

      const finish = (model) => {
        cleanup()
        console.log('[ThatOpen IFC] Geometry ready for model:', model.modelId)
        // Trigger update to ensure geometry is processed
        this.fragmentsManager.core.update(true).catch(console.warn)
        resolve(model)
      }

      const startPolling = (model) => {
        if (checkInterval) return
        let checks = 0
        console.log('[ThatOpen IFC] Polling started for model:', model.modelId)
        
        // Poll every 200ms for geometry
        checkInterval = setInterval(() => {
          checks++
          
          // Try to update fragments manager
          try {
            if (this.fragmentsManager.core && typeof this.fragmentsManager.core.update === 'function') {
              this.fragmentsManager.core.update(true).catch(() => {})
            } else if (typeof this.fragmentsManager.update === 'function') {
              // Fallback if structure is different
              this.fragmentsManager.update(true)
            }
          } catch (e) {
            if (checks === 1) console.warn('[ThatOpen IFC] Update failed:', e)
          }
          
          // Log status occasionally
          if (checks % 10 === 0) {
             console.log('[ThatOpen IFC] Polling status #' + checks + ':', {
                id: model.modelId,
                hasObject: !!model.object,
                children: model.object?.children?.length,
                tiles: model.tiles?.size,
                itemsSize: model.items?.length || model.items?.size,
                isBusy: model.isBusy
             })
          }

          if (isGeometryReady(model)) {
            finish(model)
          }
        }, 200)
      }

      const checkFragment = ({ value: model }) => {
        if (model.modelId === modelID || model.modelId === filename) {
          if (isGeometryReady(model)) {
             finish(model)
          } else {
             console.log('[ThatOpen IFC] Fragment found but geometry not ready yet, starting poll...')
             startPolling(model)
          }
        }
      }

      // Check existing fragments first
      const existing = Array.from(this.fragmentsManager.list.values())
      const found = existing.find(f => f.modelId === modelID || f.modelId === filename)
      
      if (found) {
        if (isGeometryReady(found)) {
          finish(found)
        } else {
          console.log('[ThatOpen IFC] Found existing fragment, waiting for geometry...')
          startPolling(found)
        }
      } else {
        // Listen for new ones
        this.fragmentsManager.list.onItemSet.add(checkFragment)
      }
    })
  }

  /**
   * Process model to extract IDs and Types efficiently
   */
  async processModelMetadata(model, webIfcModelID) {
    if (!model.userData) model.userData = {}
    
    // If no webIfcModelID provided, try to use model.modelId if it's a number, or look for originalModelId
    let queryModelID = webIfcModelID;
    if (queryModelID === undefined || queryModelID === null) {
       if (typeof model.modelId === 'number') queryModelID = model.modelId;
       else if (model.originalModelId !== undefined) queryModelID = model.originalModelId;
       else console.warn('[ThatOpen IFC] No numeric model ID available for web-ifc queries!');
    }
    
    const expressIDToType = {}
    const typeStats = {}
    const expressIDs = new Set()

    // --- AGGRESSIVE ID EXTRACTION (Restored from legacy logic) ---
    
    // 4. Use model.data (The Gold Standard for ThatOpen)
    // Maps ExpressID -> [FragmentUUID, ItemIndex][]
    if (model.data) {
       const dataMap = model.data instanceof Map ? model.data : new Map(Object.entries(model.data).map(([k,v]) => [Number(k), v]));
       console.log('[ThatOpen IFC] Using model.data to resolve IDs, entries:', dataMap.size);
       
       // Build FragmentUUID -> ExpressIDs map
       const fragMap = new Map();
       
       dataMap.forEach((locations, expressID) => {
          // Collect all valid Express IDs for type resolution
          expressIDs.add(expressID);
          
          if (Array.isArray(locations)) {
             for (const loc of locations) {
                // loc is [fragmentUUID, itemIndex]
                if (Array.isArray(loc) && loc.length >= 1) {
                   const fragUUID = loc[0];
                   if (!fragMap.has(fragUUID)) fragMap.set(fragUUID, []);
                   fragMap.get(fragUUID).push(expressID);
                }
             }
          }
       });
       
       // Assign mapped IDs to fragments (meshes)
       if (model.object) {
          model.object.traverse(child => {
             if (child.isMesh && child.uuid && fragMap.has(child.uuid)) {
                const ids = fragMap.get(child.uuid);
                if (ids.length > 0) {
                   // Use first ID as primary
                   child.userData.expressID = ids[0];
                   // Store all for InstancedMesh handling
                   child.userData.expressIDs = ids;
                }
             }
          });
       }
    }

    // 1. Check FragmentsModel internal structure (itemsManager)
    if (model._itemsManager && model._itemsManager.items) {
      const items = model._itemsManager.items
      if (items instanceof Map) {
        items.forEach((value, key) => {
          // Handle number keys
          if (typeof key === 'number') expressIDs.add(key)
          // Handle string keys that are numbers
          else if (typeof key === 'string') {
             const id = parseInt(key, 10)
             if (!isNaN(id)) expressIDs.add(id)
          }
          
          if (value && typeof value === 'object' && value.id) expressIDs.add(value.id)
        })
      } else if (Array.isArray(items)) {
        items.forEach(item => {
          if (typeof item === 'number') expressIDs.add(item)
          if (item && typeof item === 'object' && item.id) expressIDs.add(item.id)
        })
      }
    }

    // 1b. Check direct properties on model (items, ids)
    if (model.items) {
       if (Array.isArray(model.items)) {
         model.items.forEach(item => {
           if (typeof item === 'number') expressIDs.add(item)
           else if (item && item.id) expressIDs.add(item.id)
         })
       }
    }
    if (model.ids) {
       if (Array.isArray(model.ids)) model.ids.forEach(id => expressIDs.add(id))
       else if (model.ids instanceof Set || model.ids instanceof Uint32Array) {
          model.ids.forEach(id => expressIDs.add(id))
       }
    }

    // 2. Check Fragments/Tiles for IDs
    const fragments = []
    if (model.tiles) {
       for (const tile of model.tiles.values()) {
          if (tile && tile.fragments) {
             if (Array.isArray(tile.fragments)) fragments.push(...tile.fragments)
             else fragments.push(tile.fragments)
          } else if (tile) {
             fragments.push(tile)
          }
       }
    }
    // Also check if model has fragments array directly
    if (Array.isArray(model.fragments)) {
       fragments.push(...model.fragments)
    }
    
    for (const fragment of fragments) {
        // Check ids array
        if (fragment.ids) {
           if (Array.isArray(fragment.ids)) fragment.ids.forEach(id => expressIDs.add(id))
           else if (fragment.ids instanceof Set || fragment.ids instanceof Uint32Array) {
              fragment.ids.forEach(id => expressIDs.add(id))
           }
        }
        // Check items
        if (fragment.items) {
           if (Array.isArray(fragment.items)) {
             fragment.items.forEach(item => {
               if (typeof item === 'number') expressIDs.add(item)
               else if (item && item.id) expressIDs.add(item.id)
             })
           }
        }
    }

    // 3. Extract IDs from Geometry/UserData (Standard way)
    if (model.object) {
      model.object.traverse(child => {
        if (child.type === 'Mesh' && child.geometry) {
           const id = this.extractExpressID(child)
           if (id) {
             expressIDs.add(id)
             // Also store on mesh for easier access later
             child.userData.expressID = id
           }
        }
      })
    }
    
    // --- END AGGRESSIVE EXTRACTION ---

    // Resolve Types for collected IDs
    console.log(`[ThatOpen IFC] Resolving types for ${expressIDs.size} IDs using ModelID: ${queryModelID}`)
    let debugCount = 0;
    
    for (const id of expressIDs) {
       try {
         const typeName = await this.getIfcTypeName(queryModelID, id)
         if (typeName) {
           expressIDToType[id] = typeName
           typeStats[typeName] = (typeStats[typeName] || 0) + 1
         }
       } catch (e) {
         // ignore individual errors
       }
    }

    model.userData.ifcExpressIDToType = expressIDToType
    model.userData.ifcTypeStats = typeStats
    
    console.log(`[ThatOpen IFC] Processed metadata: ${expressIDs.size} elements, ${Object.keys(typeStats).length} types`)
  }

  extractExpressID(mesh) {
    if (!mesh.geometry || !mesh.geometry.attributes) return null
    
    const attrs = mesh.geometry.attributes
    
    // Standard checks
    if (attrs.expressID?.array?.[0]) return attrs.expressID.array[0]
    if (attrs.express_id?.array?.[0]) return attrs.express_id.array[0]
    if (attrs._expressid?.array?.[0]) return attrs._expressid.array[0]
    
    // Fuzzy check for any ID attribute
    for (const key in attrs) {
       // Skip standard geometric attributes
       if (['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight', 'tangent'].includes(key)) continue;
       
       if (key.toLowerCase().includes('express') || key.toLowerCase() === 'id') {
          if (attrs[key].array && attrs[key].array.length > 0) {
             // console.log('[ThatOpen IFC] Found fuzzy ID attribute:', key, attrs[key].array[0])
             return attrs[key].array[0]
          }
       }
    }
    
    // Check userData
    if (mesh.userData?.expressID) return mesh.userData.expressID
    if (mesh.geometry.userData?.expressID) return mesh.geometry.userData.expressID
    
    return null
  }

  async getIfcTypeName(modelID, expressID) {
    try {
      const line = await this.ifcLoader.webIfc.GetLine(modelID, expressID)
      if (line) {
        if (typeof line.type === 'string') return line.type.toUpperCase()
        if (line.constructor?.name) return line.constructor.name.toUpperCase()
      }
    } catch (e) {
      return null
    }
    return null
  }
}
