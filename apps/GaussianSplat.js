/**
 * Gaussian Splat App v3
 * Updated to match working app.configure pattern from prim_tester.js
 */

// Configure props UI
app.configure([
  {
    key: 'splatFile',
    type: 'file',
    kind: 'splat',
    label: 'Splat File',
    initial: null,
    accept: '.ply,.splat,.ksplat,.spz,.sogs,.zip',
    hint: 'Upload PLY, KSPLAT, SPLAT, SPZ, or SOGS file'
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

// Create default cube (always visible, like Model.hyp)
const defaultCube = app.create('prim', {
  type: 'box',
  position: [0, 0.5, 0], // Lift up half height so it sits on ground
  scale: [1, 1, 1],
  color: '#ffaa00',
  opacity: 0.3,
  transparent: true,
  castShadow: false,
  receiveShadow: false,
  frustumCulled: true
})
// Always add the default cube
app.add(defaultCube)

// App state
const state = {
  splat: null,
  lastSplatFile: null,
  lastSortMode: null,
  lastColor: null,
  lastOpacity: null,
  lastAutoRotate: null
}

function createSplat() {
  try {
    // Handle both object format {type, name, url} and string format
    const splatUrl = typeof props.splatFile === 'object' && props.splatFile && props.splatFile.url 
      ? props.splatFile.url 
      : props.splatFile
    
    if (!splatUrl || typeof splatUrl !== 'string' || !splatUrl.startsWith('asset://')) {
      return
    }
    
    state.splat = app.create('gaussiansplat', {
      src: splatUrl,
      sortMode: props.sortMode || 'auto',
      linked: false,
      color: props.color || '#ffffff',
      opacity: props.opacity !== undefined ? props.opacity : 1.0
    })
    
    if (props.autoRotate !== false) {
      // Rotate the entire app instead of just the splat
      // This way the transform values in the UI will be correct
      app.rotation.x = Math.PI
    }
    
    app.add(state.splat)
    state.lastSplatFile = props.splatFile
    state.lastColor = props.color
    state.lastOpacity = props.opacity
    state.lastAutoRotate = props.autoRotate
  } catch (error) {
    console.error('❌ Failed to create splat:', error)
  }
}

function removeSplat() {
  if (state.splat && state.splat.parent) {
    state.splat.parent.remove(state.splat)
    state.splat = null
  }
}

function updateSplatFile() {
  if (props.splatFile !== state.lastSplatFile) {
    removeSplat()
    // Handle both object format {type, name, url} and string format
    const splatUrl = typeof props.splatFile === 'object' && props.splatFile && props.splatFile.url 
      ? props.splatFile.url 
      : props.splatFile
    if (splatUrl && typeof splatUrl === 'string' && splatUrl.startsWith('asset://')) {
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

function updateAutoRotate() {
  if (props.autoRotate !== state.lastAutoRotate) {
    try {
      if (props.autoRotate) {
        // Enable auto-rotate: rotate app 180° on X-axis
        app.rotation.x = Math.PI
      } else {
        // Disable auto-rotate: reset app rotation
        app.rotation.x = 0
      }
      state.lastAutoRotate = props.autoRotate
    } catch (error) {
      console.error('❌ Failed to update auto-rotate:', error)
    }
  }
}



app.on('update', () => {
  updateSplatFile()
  updateSortMode()
  updateColor()
  updateOpacity()
  updateAutoRotate()
})

} // end if (world.isClient)