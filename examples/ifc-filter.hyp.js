// IFC Model Control Script - Filter elements by IFC type
// Similar to FramedImage example - configure fields immediately

app.keepActive = true

var typeStats = null
var rootNode = null
var fieldsConfigured = false
var maxSetupChecks = 1200 // Increase to 20 minutes (60 FPS * 60 seconds * 20) for large IFC files

// Initialize with section immediately so UI knows about the app (like FramedImage)
app.configure([
  { key: 'ifcFiltersSection', type: 'section', label: 'IFC Element Filters' },
])

// Function to collect IFC metadata by traversing all nodes
function collectIFCMetadata(root) {
  var stats = {}
  var expressIDToType = new Map()
  
  if (!root || !root.traverse) {
    return { stats: null, expressIDToType: null }
  }
  
  // Traverse all nodes and collect IFC type information
  root.traverse(function(node) {
    if (node.userData && node.userData.ifcType) {
      var typeName = node.userData.ifcType
      stats[typeName] = (stats[typeName] || 0) + 1
      
      if (node.userData.expressID) {
        expressIDToType.set(node.userData.expressID, typeName)
      }
    }
  })
  
  return {
    stats: Object.keys(stats).length > 0 ? stats : null,
    expressIDToType: expressIDToType.size > 0 ? expressIDToType : null
  }
}

// Function to setup filter fields from IFC metadata
function setupIFCFilters() {
  // Try multiple methods to get root node
  // app.root is the actual root node (if available)
  // app.get('$root') is the direct lookup method
  rootNode = null
  if (app.root) {
    rootNode = app.root
  } else {
    rootNode = app.get('$root')
  }
  
  if (!rootNode) {
    return false
  }

  // First try to get metadata from root.userData (if available)
  if (rootNode.userData && rootNode.userData.ifcTypeStats) {
    typeStats = rootNode.userData.ifcTypeStats
    // Only log once when found
    if (!fieldsConfigured) {
      console.log('[IFC Filter] Found metadata in root.userData')
    }
  } else {
    // Fallback: collect metadata by traversing all nodes
    var metadata = collectIFCMetadata(rootNode)
    if (!metadata.stats || Object.keys(metadata.stats).length === 0) {
      // Don't log every time - only return false silently
      return false
    }
    typeStats = metadata.stats
    if (!fieldsConfigured) {
      console.log('[IFC Filter] Collected', Object.keys(typeStats).length, 'IFC types from nodes')
    }
  }

  if (!typeStats || Object.keys(typeStats).length === 0) {
    return false
  }

  // Don't reconfigure if already done
  if (fieldsConfigured) {
    return true
  }

  console.log('[IFC Filter] Setting up filters with', Object.keys(typeStats).length, 'types')

  var configFields = []

  // Section header (already added initially, but we keep it for consistency)
  configFields.push({
    key: 'ifcFiltersSection',
    type: 'section',
    label: 'IFC Element Filters',
  })

  // Show All / Hide All buttons
  configFields.push({
    type: 'button',
    key: 'showAll',
    label: 'Show All Types',
    onClick: function() {
      var root = (app.root && app.root.mounted) ? app.root : (app.getNodes() || app.get('$root'))
      if (root && root.traverse) {
        root.traverse(function(node) {
          if (node.userData && node.userData.ifcType) {
            setNodeVisibility(node, true)
          }
        })
      }
      // Update all props to true
      var typeKeys = Object.keys(typeStats)
      for (var i = 0; i < typeKeys.length; i++) {
        props[typeKeys[i]] = true
      }
    },
  })

  configFields.push({
    type: 'button',
    key: 'hideAll',
    label: 'Hide All Types',
    onClick: function() {
      var root = (app.root && app.root.mounted) ? app.root : (app.getNodes() || app.get('$root'))
      if (root && root.traverse) {
        root.traverse(function(node) {
          if (node.userData && node.userData.ifcType) {
            setNodeVisibility(node, false)
          }
        })
      }
      // Update all props to false
      var typeKeys = Object.keys(typeStats)
      for (var i = 0; i < typeKeys.length; i++) {
        props[typeKeys[i]] = false
      }
    },
  })

  // Sort types by count (descending)
  var typeKeys = Object.keys(typeStats)
  var sortedTypes = []
  for (var i = 0; i < typeKeys.length; i++) {
    sortedTypes.push([typeKeys[i], typeStats[typeKeys[i]]])
  }
  sortedTypes.sort(function(a, b) {
    return b[1] - a[1]
  })

  // Create toggle for each IFC type
  for (var i = 0; i < sortedTypes.length; i++) {
    var typeName = sortedTypes[i][0]
    var count = sortedTypes[i][1]
    var displayName = typeName.replace(/^IFC/, '')

    configFields.push({
      type: 'toggle',
      key: typeName,
      label: displayName + ' (' + count + ')',
      hint: 'Show/hide ' + count + ' ' + displayName.toLowerCase() + ' elements',
      initial: true,
    })
  }

  // Configure app with fields - this triggers UI update via onFields callback
  app.configure(configFields)
  fieldsConfigured = true
  console.log('[IFC Filter] Fields configured successfully with', configFields.length, 'types')
  return true
}

// Helper function to set node visibility (handles both Hyperfy nodes and Three.js objects)
function setNodeVisibility(node, visible) {
  // Try Hyperfy node active property first
  if (node.ctx && node.ctx.world && typeof node.active !== 'undefined') {
    node.active = visible
  }
  // Try Three.js visible property
  else if (typeof node.visible !== 'undefined') {
    node.visible = visible
  }
  // Try accessing underlying Three.js object
  else if (node.obj && typeof node.obj.visible !== 'undefined') {
    node.obj.visible = visible
  }
}

// Try to setup filters immediately, retry on update if model not ready
var checkSetupHandler = null
var checkCount = 0
var maxChecks = maxSetupChecks || 1200 // ~20 minutes at 60fps for large IFC files
if (!setupIFCFilters()) {
  console.log('[IFC Filter] Model not ready, will retry in update loop (checking silently)')
  checkSetupHandler = function(dt) {
    checkCount++
    if (!fieldsConfigured && setupIFCFilters()) {
      console.log('[IFC Filter] Setup successful after', checkCount, 'checks')
      if (checkSetupHandler) {
        app.off('update', checkSetupHandler)
        checkSetupHandler = null
      }
    } else if (checkCount >= maxChecks) {
      console.warn('[IFC Filter] Setup failed after', maxChecks, 'checks - giving up')
      app.off('update', checkSetupHandler)
      checkSetupHandler = null
    }
    // Silent - don't log every check to reduce spam
  }
  app.on('update', checkSetupHandler)
}

// Track previous prop values to detect changes
var prevProps = {}

// Update visibility based on props in update loop
app.on('update', function(dt) {
  if (!rootNode || !typeStats || !fieldsConfigured) return

  var typeKeys = Object.keys(typeStats)
  for (var i = 0; i < typeKeys.length; i++) {
    var typeName = typeKeys[i]
    var currentValue = props[typeName] !== undefined ? props[typeName] : true
    var prevValue = prevProps[typeName]

    // Only update if value changed
    if (prevValue !== currentValue) {
      prevProps[typeName] = currentValue
      if (rootNode && rootNode.traverse) {
        rootNode.traverse(function(node) {
          if (node.userData && node.userData.ifcType === typeName) {
            setNodeVisibility(node, currentValue)
          }
        })
      }
    }
  }
})

