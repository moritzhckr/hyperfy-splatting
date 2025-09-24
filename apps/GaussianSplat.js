/**
 * Gaussian Splat App v3
 * Updated to match working app.configure pattern from prim_tester.js
 */

// Configure props UI
app.configure([
  {
    key: 'splatFile',
    type: 'file',
    label: 'Splat File',
    initial: null,
    accept: '.ply,.splat,.ksplat,.spz,.sogs,.zip',
    hint: 'Upload PLY, KSPLAT, SPLAT, SPZ, or SOGS file'
  },
  {
    key: 'sortMode',
    type: 'select',
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
  },
  {
    key: 'color',
    type: 'color',
    label: 'Splat Color',
    initial: '#ffffff',
    hint: 'Tint color for the splats'
  },
  {
    key: 'opacity',
    type: 'range',
    label: 'Splat Opacity',
    initial: 1.0,
    min: 0.0,
    max: 1.0,
    step: 0.01,
    hint: 'Overall transparency of the splats'
  },
])

// Only run rendering logic on client
if (world.isClient) {

// Create cube handle immediately
const cubeHandle = app.create('prim', {
  type: 'box',
  position: [0, 0, 0],
  scale: [0.5, 0.5, 0.5],
  color: '#ffaa00',
  opacity: 0.2,
  transparent: true,
  castShadow: false,
  receiveShadow: false,
  frustumCulled: true
})
app.add(cubeHandle)

// App state
const state = {
  splat: null,
  lastSplatFile: null,
  lastSortMode: null,
  lastShowCube: null,
  lastColor: null,
  lastOpacity: null
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
      linked: false,
      color: props.color || '#ffffff',
      opacity: props.opacity !== undefined ? props.opacity : 1.0
    })
    
    if (props.autoRotate !== false) {
      state.splat.rotation.x = Math.PI
    }
    
    app.add(state.splat)
    state.lastSplatFile = props.splatFile
    state.lastColor = props.color
    state.lastOpacity = props.opacity
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
    if (props.splatFile && typeof props.splatFile === 'string' && props.splatFile.startsWith('asset://')) {
      createSplat()
    }
    state.lastSplatFile = props.splatFile
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

function updateColor() {
  if (state.splat && props.color && props.color !== state.lastColor) {
    try {
      state.splat.color = props.color
      state.lastColor = props.color
    } catch (error) {
      console.error('❌ Failed to update color:', error)
    }
  }
}

function updateOpacity() {
  if (state.splat && props.opacity !== undefined && props.opacity !== state.lastOpacity) {
    try {
      state.splat.opacity = props.opacity
      state.lastOpacity = props.opacity
    } catch (error) {
      console.error('❌ Failed to update opacity:', error)
    }
  }
}



app.on('update', () => {
  updateCubeVisibility()
  updateSplatFile()
  updateSortMode()
  updateColor()
  updateOpacity()
})

console.log('🌟 Gaussian Splat app ready with properties:', {
  splatFile: 'file',
  sortMode: 'select',
  showCube: 'toggle', 
  autoRotate: 'toggle',
  color: 'color',
  opacity: 'range'
})

} // end if (world.isClient)