/**
 * Legacy IFC Loader Wrapper
 * 
 * Uses the proven web-ifc based IFCLoader that correctly:
 * - Assigns building element ExpressIDs to geometry (not geometry primitives)
 * - Provides proper spatial structure hierarchy
 * - Maintains IFC semantics
 */

import * as THREE from '../extras/three'
import { IFCLoader } from '../libs/ifcloader/IFCLoader.js'

export class LegacyIFCLoader {
  constructor() {
    this.ifcLoader = new IFCLoader()
    this.setupPromise = this.setup()
  }

  async setup() {
    try {
      await this.ifcLoader.ifcManager.setWasmPath('/')
      console.log('[Legacy IFC] Setup complete')
    } catch (err) {
      console.error('[Legacy IFC] Setup failed:', err)
    }
  }

  async loadAsync(url) {
    try {
      if (this.setupPromise) {
        await this.setupPromise
        this.setupPromise = null
      }

      console.log('[Legacy IFC] Loading:', url)
      
      const response = await fetch(url)
      const buffer = await response.arrayBuffer()
      
      // IFCModel extends Mesh - it IS the geometry
      const model = await this.ifcLoader.ifcManager.parse(buffer)
      
      console.log('[Legacy IFC] Model loaded, ID:', model.modelID)
      console.log('[Legacy IFC] Model is Mesh:', model.isMesh)
      console.log('[Legacy IFC] Has geometry:', !!model.geometry)
      console.log('[Legacy IFC] Has material:', !!model.material)
      
      if (model.geometry) {
        console.log('[Legacy IFC] Geometry vertices:', model.geometry.attributes?.position?.count || 0)
        console.log('[Legacy IFC] Has expressID attr:', !!model.geometry.attributes?.expressID)
      }

      const spatialStructure = await model.getSpatialStructure()
      console.log('[Legacy IFC] Spatial structure loaded')
      
      const types = await this.getAllTypes(model)
      console.log('[Legacy IFC] Found', Object.keys(types.typeStats).length, 'types')
      console.log('[Legacy IFC] ID mappings:', Object.keys(types.expressIDToType).length)
      
      // The model itself is a Mesh with geometry and material
      // Store metadata directly on the model
      model.userData.ifcModelID = model.modelID
      model.userData.ifcTypeStats = types.typeStats
      model.userData.ifcExpressIDToType = types.expressIDToType
      model.userData.ifcSpatialStructure = spatialStructure
      
      this.logHierarchy(spatialStructure, 0)
      
      // Return the model directly - it's already a Mesh
      return model

    } catch (err) {
      console.error('[Legacy IFC] Error:', err)
      throw err
    }
  }

  async getAllTypes(model) {
    const typeStats = {}
    const expressIDToType = {}
    
    try {
      const modelID = model.modelID
      const ifcManager = this.ifcLoader.ifcManager
      
      const typeNames = [
        'IFCWALL', 'IFCWALLSTANDARDCASE',
        'IFCSLAB', 'IFCDOOR', 'IFCWINDOW',
        'IFCCOLUMN', 'IFCBEAM', 'IFCROOF',
        'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAILING',
        'IFCCURTAINWALL', 'IFCPLATE', 'IFCMEMBER',
        'IFCFURNISHINGELEMENT', 'IFCFURNITURE',
        'IFCSPACE', 'IFCBUILDING', 'IFCBUILDINGSTOREY',
        'IFCSITE', 'IFCPROJECT', 'IFCOPENINGELEMENT',
        'IFCCOVERING', 'IFCFOOTING',
      ]
      
      for (const typeName of typeNames) {
        try {
          const typeCode = ifcManager.state.api.GetTypeCodeFromName(modelID, typeName)
          if (typeCode === undefined) continue
          
          const elements = await ifcManager.state.api.GetLineIDsWithType(modelID, typeCode)
          if (elements && elements.size() > 0) {
            const count = elements.size()
            typeStats[typeName] = count
            
            for (let i = 0; i < count; i++) {
              const id = elements.get(i)
              expressIDToType[id] = typeName
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[Legacy IFC] Error getting types:', err)
    }
    
    return { typeStats, expressIDToType }
  }

  logHierarchy(node, depth, maxDepth = 4) {
    if (depth > maxDepth) return
    const indent = '  '.repeat(depth)
    const type = node.type || 'unknown'
    const id = node.expressID || '-'
    console.log(indent + type + ' (#' + id + ')')
    
    if (node.children) {
      for (const child of node.children.slice(0, 5)) {
        this.logHierarchy(child, depth + 1, maxDepth)
      }
      if (node.children.length > 5) {
        console.log(indent + '  ... and ' + (node.children.length - 5) + ' more')
      }
    }
  }
}

