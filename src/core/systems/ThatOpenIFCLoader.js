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
    this.hider = this.components.get(OBC.Hider)
    
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

      // Build spatial structure from web-ifc
      let spatialStructure = null
      try {
        spatialStructure = await this.buildSpatialStructure(webIfcModelID)
      } catch (spatialErr) {
        console.warn('[ThatOpen IFC] Could not build spatial structure:', spatialErr.message)
      }

      // Convert to Three.js Group
      const group = new THREE.Group()
      group.modelID = fragmentsModel.modelId
      
      if (fragmentsModel.object) {
        group.add(fragmentsModel.object)
      } else {
        throw new Error('No Three.js object found in FragmentsModel')
      }

      // Store useful data in userData - including ThatOpen APIs for visibility control
      group.userData = {
        ifcModelID: fragmentsModel.modelId,
        webIfcModelID: webIfcModelID, // The numeric model ID for web-ifc queries
        fragmentsModel: fragmentsModel,
        thatOpenComponents: this.components,
        thatOpenHider: this.hider,
        thatOpenFragments: this.fragmentsManager,
        webIfc: this.ifcLoader.webIfc, // Direct reference to web-ifc API
        // Transfer processed metadata
        ifcTypeStats: fragmentsModel.userData.ifcTypeStats,
        ifcExpressIDToType: fragmentsModel.userData.ifcExpressIDToType,
        // Add spatial structure for hierarchy
        ifcSpatialStructure: spatialStructure,
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
    
    // Debug model structure (minimal logging)
    
    // Try to get fragment data from various sources
    let fragmentDataMap = null
    const dataManager = model._dataManager
    
    // Source 1: model.data (legacy)
    if (model.data && (model.data instanceof Map ? model.data.size > 0 : Object.keys(model.data).length > 0)) {
       fragmentDataMap = model.data instanceof Map ? model.data : new Map(Object.entries(model.data).map(([k,v]) => [Number(k), v]))
       console.log('[ThatOpen IFC] Using model.data, entries:', fragmentDataMap.size)
    }
    // Source 2: _dataManager._data
    else if (dataManager && dataManager._data) {
       fragmentDataMap = dataManager._data instanceof Map ? dataManager._data : new Map(Object.entries(dataManager._data).map(([k,v]) => [Number(k), v]))
       console.log('[ThatOpen IFC] Using _dataManager._data, entries:', fragmentDataMap.size)
    }
    // Source 3: _dataManager.data
    else if (dataManager && dataManager.data) {
       fragmentDataMap = dataManager.data instanceof Map ? dataManager.data : new Map(Object.entries(dataManager.data).map(([k,v]) => [Number(k), v]))
       console.log('[ThatOpen IFC] Using _dataManager.data, entries:', fragmentDataMap.size)
    }
    
    if (fragmentDataMap && fragmentDataMap.size > 0) {
       // Build FragmentUUID -> ExpressIDs map
       const fragMap = new Map()
       
       fragmentDataMap.forEach((locations, expressID) => {
          expressIDs.add(expressID)
          
          if (Array.isArray(locations)) {
             for (const loc of locations) {
                if (Array.isArray(loc) && loc.length >= 1) {
                   const fragUUID = loc[0]
                   if (!fragMap.has(fragUUID)) fragMap.set(fragUUID, [])
                   fragMap.get(fragUUID).push(expressID)
                }
             }
          }
       })
       
       // Assign mapped IDs to fragments (meshes)
       if (model.object) {
          model.object.traverse(child => {
             if (child.isMesh && child.uuid && fragMap.has(child.uuid)) {
                const ids = fragMap.get(child.uuid)
                if (ids.length > 0) {
                   child.userData.expressID = ids[0]
                   child.userData.expressIDs = ids
                }
             }
          })
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

    // Resolve Types for collected IDs (from geometry)
    console.log(`[ThatOpen IFC] Resolving types for ${expressIDs.size} geometry IDs using ModelID: ${queryModelID}`)
    
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

    // Get ALL IFC entity types from the model using GetIfcEntityList
    // This is the proper way to discover all types in the file
    try {
      const webIfc = this.ifcLoader.webIfc
      if (webIfc && queryModelID !== undefined) {
        console.log('[ThatOpen IFC] Querying all IFC entity types from web-ifc...')
        
        // Get list of all entity type codes in this model
        let entityTypes = []
        if (webIfc.GetIfcEntityList) {
          entityTypes = await webIfc.GetIfcEntityList(queryModelID)
          console.log(`[ThatOpen IFC] Model contains ${entityTypes.length} different entity types`)
        }
        
        // Filter to only include building element types (not geometry primitives)
        // IFC Building Element type codes (approximate ranges)
        const buildingElementTypes = new Set([
          // Walls
          'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLTYPE', 'IFCWALLELEMENTEDCASE',
          // Slabs/Floors
          'IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABTYPE', 'IFCSLABELEMENTEDCASE',
          // Doors
          'IFCDOOR', 'IFCDOORSTANDARDCASE', 'IFCDOORTYPE',
          // Windows  
          'IFCWINDOW', 'IFCWINDOWSTANDARDCASE', 'IFCWINDOWTYPE',
          // Columns
          'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE', 'IFCCOLUMNTYPE',
          // Beams
          'IFCBEAM', 'IFCBEAMSTANDARDCASE', 'IFCBEAMTYPE',
          // Other building elements
          'IFCROOF', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING', 'IFCRAMP', 'IFCRAMPFLIGHT',
          'IFCCURTAINWALL', 'IFCPLATE', 'IFCMEMBER',
          'IFCFOOTING', 'IFCPILE', 'IFCFOUNDATION',
          'IFCCOVERING', 'IFCOPENINGELEMENT',
          // MEP
          'IFCDUCTFITTING', 'IFCDUCTSEGMENT', 'IFCPIPEFITTING', 'IFCPIPESEGMENT',
          'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL',
          // Furniture
          'IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCFURNITURETYPE',
          // Spatial
          'IFCSPACE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSITE', 'IFCPROJECT',
          // Generic
          'IFCBUILDINGELEMENTPROXY', 'IFCBUILDINGELEMENT',
        ])
        
        for (const typeCode of entityTypes) {
          try {
            // Get type name from code
            let typeName = null
            if (webIfc.GetNameFromTypeCode) {
              typeName = webIfc.GetNameFromTypeCode(typeCode)
            }
            
            if (!typeName) continue
            
            // Only process building elements, skip geometry primitives
            const normalizedName = typeName.toUpperCase()
            if (!buildingElementTypes.has(normalizedName)) {
              // Skip non-building elements like IFCCARTESIANPOINT, IFCDIRECTION, etc.
              continue
            }
            
            const elements = webIfc.GetLineIDsWithType(queryModelID, typeCode)
            if (elements && typeof elements.size === 'function') {
              const count = elements.size()
              if (count > 0) {
                typeStats[normalizedName] = (typeStats[normalizedName] || 0) + count
                // Add all IDs to the map
                for (let i = 0; i < count; i++) {
                  const id = elements.get(i)
                  if (id) {
                    expressIDToType[id] = normalizedName
                    expressIDs.add(id)
                  }
                }
                // Element types collected silently
              }
            }
          } catch (typeErr) {
            // Type query error - continue
          }
        }
      }
    } catch (allTypesErr) {
      console.warn('[ThatOpen IFC] Could not query all IFC types:', allTypesErr)
    }

    model.userData.ifcExpressIDToType = expressIDToType
    model.userData.ifcTypeStats = typeStats
    
    console.log(`[ThatOpen IFC] Processed: ${Object.keys(typeStats).length} types, ${expressIDs.size} elements`)
    
    // Try to get categories from _dataManager for better mesh type assignment
    let meshCategories = null
    try {
      if (model._dataManager && typeof model._dataManager.getCategories === 'function') {
        meshCategories = await model._dataManager.getCategories()
        console.log('[ThatOpen IFC] Got categories from _dataManager')
      }
    } catch (e) {
      // Categories not available
    }
    
    // Assign types to meshes - try multiple strategies
    if (model.object) {
      let assignedCount = 0
      model.object.traverse(child => {
        if (!child.isMesh) return
        
        // Strategy 1: Check expressID mapping
        if (child.userData?.expressID) {
          const id = child.userData.expressID
          if (expressIDToType[id]) {
            child.userData.ifcType = expressIDToType[id]
            assignedCount++
            return
          }
        }
        
        // Strategy 2: Check expressIDs array
        if (child.userData?.expressIDs) {
          for (const id of child.userData.expressIDs) {
            if (expressIDToType[id]) {
              child.userData.ifcType = expressIDToType[id]
              child.userData.expressID = id
              assignedCount++
              return
            }
          }
        }
        
        // Strategy 3: Try to infer from mesh name or material
        if (child.name) {
          const nameParts = child.name.toUpperCase().split(/[_\-\s]/)
          for (const part of nameParts) {
            if (part.startsWith('IFC') && typeStats[part]) {
              child.userData.ifcType = part
              assignedCount++
              return
            }
          }
        }
        
        // Strategy 4: Check material name
        if (child.material?.name) {
          const matName = child.material.name.toUpperCase()
          for (const typeName of Object.keys(typeStats)) {
            if (matName.includes(typeName.replace('IFC', ''))) {
              child.userData.ifcType = typeName
              assignedCount++
              return
            }
          }
        }
      })
      
      if (assignedCount > 0) {
        console.log(`[ThatOpen IFC] Assigned types to ${assignedCount} meshes`)
      }
    }
  }
  
  logHierarchy(obj, depth, expressIDToType, maxDepth = 3) {
    if (depth > maxDepth) return
    const indent = '  '.repeat(depth)
    const name = obj.name || obj.uuid?.slice(0, 8) || 'unnamed'
    const type = obj.type || 'unknown'
    const expressID = obj.userData?.expressID || '-'
    // Look up type from map if not already assigned
    let ifcType = obj.userData?.ifcType || '-'
    if (ifcType === '-' && expressID !== '-' && expressIDToType && expressIDToType[expressID]) {
      ifcType = `(${expressIDToType[expressID]})`
    }
    console.log(`${indent}${type}: ${name} [ExpressID: ${expressID}, Type: ${ifcType}]`)
    if (obj.children) {
      for (const child of obj.children.slice(0, 10)) {
        this.logHierarchy(child, depth + 1, expressIDToType, maxDepth)
      }
      if (obj.children.length > 10) {
        console.log(`${indent}  ... and ${obj.children.length - 10} more children`)
      }
    }
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

  logSpatialStructure(node, depth, maxDepth = 4) {
    if (!node || depth > maxDepth) return
    const indent = '  '.repeat(depth)
    const type = node.type || node.Category || 'UNKNOWN'
    const id = node.expressID || node.ExpressID || node.id || '-'
    const name = node.name || node.Name || ''
    console.log(`${indent}${type} #${id} ${name}`)
    
    const children = node.children || node.Children || []
    for (const child of children.slice(0, 10)) {
      this.logSpatialStructure(child, depth + 1, maxDepth)
    }
    if (children.length > 10) {
      console.log(`${indent}  ... and ${children.length - 10} more`)
    }
  }
  
  /**
   * Build spatial structure directly from web-ifc
   * This is more reliable than ThatOpen's _dataManager.getSpatialStructure()
   */
  async buildSpatialStructure(modelID) {
    const webIfc = this.ifcLoader.webIfc
    if (!webIfc) return null

    // IFC type codes for spatial elements
    const IFCPROJECT = 103090709
    const IFCSITE = 4097777520
    const IFCBUILDING = 4031249490
    const IFCBUILDINGSTOREY = 3124254112
    const IFCSPACE = 3856911033
    const IFCRELAGGREGATES = 160246688
    const IFCRELCONTAINEDINSPATIALSTRUCTURE = 3242617779

    try {
      // Get the project (root of spatial structure)
      const projectIds = webIfc.GetLineIDsWithType(modelID, IFCPROJECT)
      if (!projectIds || projectIds.size() === 0) {
        console.warn('[ThatOpen IFC] No IFCPROJECT found')
        return null
      }
      
      const projectId = projectIds.get(0)
      const projectLine = await webIfc.GetLine(modelID, projectId)
      
      const buildNode = async (expressID, typeName) => {
        const node = {
          expressID: expressID,
          type: typeName,
          name: '',
          children: []
        }

        // Try to get name
        try {
          const line = await webIfc.GetLine(modelID, expressID)
          if (line && line.Name && line.Name.value) {
            node.name = line.Name.value
          }
        } catch (e) {}

        // Find children via IFCRELAGGREGATES
        try {
          const allAggregates = webIfc.GetLineIDsWithType(modelID, IFCRELAGGREGATES)
          for (let i = 0; i < allAggregates.size(); i++) {
            const relId = allAggregates.get(i)
            const rel = await webIfc.GetLine(modelID, relId)
            
            if (rel && rel.RelatingObject && rel.RelatingObject.value === expressID) {
              // This relation connects our element to children
              if (rel.RelatedObjects) {
                for (const child of rel.RelatedObjects) {
                  if (child && child.value) {
                    const childId = child.value
                    const childType = await this.getIfcTypeName(modelID, childId)
                    if (childType) {
                      const childNode = await buildNode(childId, childType)
                      node.children.push(childNode)
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // console.warn('[ThatOpen IFC] Error getting aggregates:', e)
        }

        // Find contained elements via IFCRELCONTAINEDINSPATIALSTRUCTURE
        try {
          const allContained = webIfc.GetLineIDsWithType(modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE)
          for (let i = 0; i < allContained.size(); i++) {
            const relId = allContained.get(i)
            const rel = await webIfc.GetLine(modelID, relId)
            
            if (rel && rel.RelatingStructure && rel.RelatingStructure.value === expressID) {
              // This relation connects our spatial element to contained elements
              if (rel.RelatedElements) {
                for (const element of rel.RelatedElements) {
                  if (element && element.value) {
                    const elemId = element.value
                    const elemType = await this.getIfcTypeName(modelID, elemId)
                    if (elemType) {
                      // Only include building elements, not geometry
                      if (this.isBuildingElement(elemType)) {
                        node.children.push({
                          expressID: elemId,
                          type: elemType,
                          name: '',
                          children: []
                        })
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          // console.warn('[ThatOpen IFC] Error getting contained elements:', e)
        }

        return node
      }

      const root = await buildNode(projectId, 'IFCPROJECT')
      return root

    } catch (err) {
      console.error('[ThatOpen IFC] Error building spatial structure:', err)
      return null
    }
  }

  isBuildingElement(typeName) {
    const buildingElements = [
      'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE',
      'IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE',
      'IFCDOOR', 'IFCDOORSTANDARDCASE',
      'IFCWINDOW', 'IFCWINDOWSTANDARDCASE',
      'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE',
      'IFCBEAM', 'IFCBEAMSTANDARDCASE',
      'IFCROOF', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING', 'IFCRAMP',
      'IFCCURTAINWALL', 'IFCPLATE', 'IFCMEMBER',
      'IFCFOOTING', 'IFCPILE',
      'IFCCOVERING', 'IFCOPENINGELEMENT',
      'IFCFURNISHINGELEMENT', 'IFCFURNITURE',
      'IFCSPACE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSITE',
      'IFCBUILDINGELEMENTPROXY',
      'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL',
    ]
    return buildingElements.includes(typeName?.toUpperCase())
  }

  countNodes(node) {
    if (!node) return 0
    let count = 1
    for (const child of (node.children || [])) {
      count += this.countNodes(child)
    }
    return count
  }
}
