// IFC Interactive Doors
// Automatically finds all IFC doors and makes them interactive
// Press E (or click Action) to open/close doors

app.keepActive = true

var doorStates = new Map() // door expressID -> { isOpen, targetRotation, currentRotation, speed }
var doorActions = new Map() // door expressID -> action node
var doorNodes = []
var setupComplete = false

// Configuration
app.configure([
  {
    key: 'doorSection',
    type: 'section',
    label: 'IFC Door Settings'
  },
  {
    type: 'number',
    key: 'openAngle',
    label: 'Open Angle (degrees)',
    initial: 90,
    hint: 'How far doors open (in degrees)'
  },
  {
    type: 'number',
    key: 'animationSpeed',
    label: 'Animation Speed',
    initial: 3,
    hint: 'How fast doors open/close (higher = faster)'
  },
  {
    type: 'number',
    key: 'interactionDistance',
    label: 'Interaction Distance',
    initial: 2.5,
    hint: 'How close you need to be to interact (meters)'
  },
  {
    type: 'toggle',
    key: 'autoClose',
    label: 'Auto-close Doors',
    initial: false,
    hint: 'Automatically close doors after a delay'
  },
  {
    type: 'number',
    key: 'autoCloseDelay',
    label: 'Auto-close Delay (seconds)',
    initial: 3,
    hint: 'How long to wait before auto-closing'
  }
])

// Helper function to find all door nodes in the IFC model
function findDoorNodes() {
  var doors = []

  // Search through all apps in the world for IFC models
  var apps = world.apps.getAll()

  for (var i = 0; i < apps.length; i++) {
    var otherApp = apps[i]

    // Skip self
    if (otherApp === app) continue

    // Try to get root node
    var root = otherApp.root || otherApp.get('$root')
    if (!root) continue

    // Check if this app has IFC data
    var hasIFCData = false
    root.traverse(function(node) {
      if (node.userData && node.userData.ifcType) {
        hasIFCData = true
      }
    })

    if (!hasIFCData) continue

    // Found an IFC model, search for doors
    root.traverse(function(node) {
      if (node.userData && node.userData.ifcType) {
        var ifcType = node.userData.ifcType.toUpperCase()
        // Check if this is a door element
        if (ifcType === 'IFCDOOR' || ifcType === 'IFCDOORSTANDARDCASE') {
          doors.push(node)
        }
      }
    })
  }

  return doors
}

// Determine door opening direction from IFC metadata
function getDoorOpeningDirection(doorNode) {
  // Try to get from IFC properties
  if (doorNode.userData && doorNode.userData.ifcProperties) {
    var props = doorNode.userData.ifcProperties

    // Check OperationType property
    if (props.operationType || props.OperationType) {
      var opType = (props.operationType || props.OperationType).toUpperCase()

      if (opType.includes('LEFT')) return -1 // Open to the left
      if (opType.includes('RIGHT')) return 1 // Open to the right
    }

    // Check PredefinedType
    if (props.predefinedType) {
      var predType = props.predefinedType.toUpperCase()
      if (predType.includes('LEFT')) return -1
      if (predType.includes('RIGHT')) return 1
    }
  }

  // Try to get from property sets
  if (doorNode.userData && doorNode.userData.ifcPropertySets) {
    var psets = doorNode.userData.ifcPropertySets

    for (var psetName in psets) {
      var pset = psets[psetName]
      for (var propName in pset) {
        var propValue = String(pset[propName]).toUpperCase()
        if (propValue.includes('LEFT')) return -1
        if (propValue.includes('RIGHT')) return 1
      }
    }
  }

  // Default: open to the right
  return 1
}

// Calculate door pivot point (usually at one side of the door)
function getDoorPivotOffset(doorNode) {
  // Try to estimate from bounding box of meshes
  var minX = Infinity
  var maxX = -Infinity
  var hasGeometry = false

  doorNode.traverse(function(child) {
    if (child.name === 'mesh' && child.geometry) {
      hasGeometry = true
      // Get local position of mesh
      var pos = child.position
      minX = Math.min(minX, pos.x)
      maxX = Math.max(maxX, pos.x)
    }
  })

  if (!hasGeometry) return 0

  // Pivot is usually at the min or max X depending on opening direction
  var width = maxX - minX
  return width > 0 ? minX : 0
}

// Setup doors with interaction
function setupDoors() {
  doorNodes = findDoorNodes()

  if (doorNodes.length === 0) {
    console.log('[IFC Doors] No doors found in IFC model')
    return true // Setup complete, just no doors
  }

  console.log('[IFC Doors] Found', doorNodes.length, 'doors')

  // Setup each door
  for (var i = 0; i < doorNodes.length; i++) {
    var doorNode = doorNodes[i]
    var expressID = doorNode.userData.expressID || i

    // Determine opening direction
    var direction = getDoorOpeningDirection(doorNode)

    // Initialize door state
    doorStates.set(expressID, {
      isOpen: false,
      targetRotation: 0,
      currentRotation: 0,
      speed: props.animationSpeed || 3,
      direction: direction,
      doorNode: doorNode,
      originalRotation: doorNode.rotation.y,
      autoCloseTimer: null
    })

    // Create action node for interaction
    // Position is relative to doorNode, so we use local coordinates
    var action = app.create('action', {
      label: 'Open Door',
      distance: props.interactionDistance || 2.5,
      duration: 0.1,
      position: [0, 1, 0], // Place at door handle height (local to door)
      onTrigger: createDoorToggleHandler(expressID)
    })

    doorNode.add(action)
    doorActions.set(expressID, action)
  }

  console.log('[IFC Doors] Setup complete:', doorNodes.length, 'interactive doors')
  return true
}

// Create a toggle handler for a specific door
function createDoorToggleHandler(expressID) {
  return function() {
    toggleDoor(expressID)
  }
}

// Toggle door open/close
function toggleDoor(expressID) {
  var state = doorStates.get(expressID)
  if (!state) return

  // Clear auto-close timer if exists
  if (state.autoCloseTimer !== null) {
    clearTimeout(state.autoCloseTimer)
    state.autoCloseTimer = null
  }

  var action = doorActions.get(expressID)

  if (state.isOpen) {
    // Close door
    state.targetRotation = 0
    state.isOpen = false
    if (action) action.label = 'Open Door'
  } else {
    // Open door
    var openAngle = (props.openAngle || 90) * DEG2RAD
    state.targetRotation = openAngle * state.direction
    state.isOpen = true
    if (action) action.label = 'Close Door'

    // Setup auto-close if enabled
    if (props.autoClose) {
      var delay = (props.autoCloseDelay || 3) * 1000
      state.autoCloseTimer = setTimeout(function() {
        toggleDoor(expressID)
      }, delay)
    }
  }
}

// Try to setup doors, retry if model not ready
var checkCount = 0
var maxChecks = 600 // 10 seconds at 60fps
var checkHandler = null

if (!setupDoors()) {
  console.log('[IFC Doors] Model not ready, will retry...')
  checkHandler = function(dt) {
    checkCount++
    if (!setupComplete && setupDoors()) {
      setupComplete = true
      console.log('[IFC Doors] Setup successful after', checkCount, 'checks')
      if (checkHandler) {
        app.off('update', checkHandler)
        checkHandler = null
      }
    } else if (checkCount >= maxChecks) {
      console.warn('[IFC Doors] Setup failed after', maxChecks, 'checks')
      app.off('update', checkHandler)
      checkHandler = null
    }
  }
  app.on('update', checkHandler)
} else {
  setupComplete = true
}

// Animate doors
app.on('update', function(dt) {
  if (!setupComplete) return

  // Update animation speed from props
  var speed = props.animationSpeed || 3

  doorStates.forEach(function(state, expressID) {
    // Smooth rotation animation
    var diff = state.targetRotation - state.currentRotation

    if (Math.abs(diff) > 0.001) {
      // Lerp towards target
      var step = diff * speed * dt
      state.currentRotation += step

      // Apply rotation to door node
      if (state.doorNode) {
        state.doorNode.rotation.y = state.originalRotation + state.currentRotation
      }
    } else if (Math.abs(diff) > 0) {
      // Snap to target when very close
      state.currentRotation = state.targetRotation
      if (state.doorNode) {
        state.doorNode.rotation.y = state.originalRotation + state.currentRotation
      }
    }
  })
})

// Update interaction distance when config changes
var prevDistance = props.interactionDistance || 2.5
app.on('update', function(dt) {
  if (!setupComplete) return

  var currentDistance = props.interactionDistance || 2.5
  if (currentDistance !== prevDistance) {
    prevDistance = currentDistance
    doorActions.forEach(function(action) {
      action.distance = currentDistance
    })
  }
})
