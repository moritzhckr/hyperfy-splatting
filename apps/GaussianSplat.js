/**
 * Gaussian Splat App v2
 * Simple and functional splat app with cube handle toggle
 * Based on model app pattern for reliable prop handling
 */

// Only run on client - server doesn't have Spark.js or DOM APIs
if (world.isClient) {

app.configure([
  {
    key: 'splatFile',
    type: 'file',
    label: 'Splat File',
    initial: null,
    accept: '.ply,.splat,.ksplat,.spz',
    hint: 'Upload PLY, KSPLAT, SPLAT, or SPZ file'
  },
  {
    key: 'sortMode',
    type: 'switch',
    label: 'Sort Mode',
    initial: 'auto',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'distance', label: 'Distance' },
      { value: 'none', label: 'None' }
    ],
    hint: 'Splat sorting algorithm'
  },
  {
    key: 'showCube',
    type: 'toggle',
    label: 'Show Cube Handle',
    initial: true,
    hint: 'Toggle visibility of positioning cube handle'
  },
  {
    key: 'autoRotate',
    type: 'toggle',
    label: 'Auto-Rotate Splats',
    initial: true,
    hint: 'Automatically rotate splats 180° on X-axis for correct orientation'
  }
])

// Create cube handle immediately
const cubeHandle = app.create('prim', {
  type: 'box',
  position: [0, 0, 0],
  scale: [0.5, 0.5, 0.5], // Smaller cube for better performance
  color: '#ffaa00',
  opacity: 0.2, // Lower opacity to reduce GPU load
  transparent: true,
  castShadow: false,
  receiveShadow: false,
  frustumCulled: true // Enable frustum culling
})
app.add(cubeHandle)

// App state
const state = {
  splat: null,
  lastSplatFile: null,
  lastSortMode: null,
  lastShowCube: null
}

// Helper functions
function updateCubeVisibility() {
  if (typeof props.showCube !== 'undefined' && props.showCube !== state.lastShowCube) {
    cubeHandle.visible = props.showCube
    state.lastShowCube = props.showCube
  }
}

function createSplat() {
  try {
    state.splat = app.create('gaussiansplat', {
      src: props.splatFile,
      sortMode: props.sortMode || 'auto',
      linked: false
    })
    
    if (props.autoRotate !== false) {
      state.splat.rotation.x = Math.PI
    }
    
    app.add(state.splat)
    state.lastSplatFile = props.splatFile
  } catch (error) {
    console.error('❌ Failed to create splat:', error)
  }
}

function removeSplat() {
  if (state.splat?.parent) {
    state.splat.parent.remove(state.splat)
    state.splat = null
  }
}

function updateSplatFile() {
  if (props.splatFile !== state.lastSplatFile) {
    removeSplat()
    createSplat()
  }
}

function updateSortMode() {
  if (state.splat && props.sortMode && props.sortMode !== state.lastSortMode) {
    try {
      state.splat.sortMode = props.sortMode
      state.lastSortMode = props.sortMode
    } catch (error) {
      console.error('❌ Failed to update sort mode:', error)
    }
  }
}

app.on('update', () => {
  updateCubeVisibility()
  
  if (props.splatFile && typeof props.splatFile === 'string' && props.splatFile.startsWith('asset://')) {
    updateSplatFile()
    updateSortMode()
  }
})

console.log('🌟 Gaussian Splat app ready!')

} // end if (world.isClient)