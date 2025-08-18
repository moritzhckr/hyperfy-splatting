/**
 * Advanced Spark.js Features Test
 * Testing working Spark.js APIs in Hyperfy for Gaussian Splatting
 */

// Only run on client - server doesn't have Spark.js
if (world.isClient) {

// Test 1: Basic splat with default parameters
const basicSplat = app.create('gaussiansplat', {
  src: 'asset://example.ply',
  position: [0, 1, 0],
  sortMode: 'auto'
})
app.add(basicSplat)

// Test 2: Advanced splat with all new parameters
const advancedSplat = app.create('gaussiansplat', {
  src: 'asset://example.ply',
  position: [3, 1, 0],
  sortMode: 'distance',
  maxSplats: 500000,
  alphaTest: 0.2,
  useShaderMaterial: true,
  enableDistanceBasedSorting: true,
  sortingWorkerEnabled: true,
  colorAdjustment: { r: 1.2, g: 0.9, b: 1.1 },
  enableDualQuaternionSkinning: false,
  procedural: false,
  animationSpeed: 1.5
})
app.add(advancedSplat)

// Test 3: Procedural splat (if supported)
const proceduralSplat = app.create('gaussiansplat', {
  src: 'asset://example.ply',
  position: [-3, 1, 0],
  procedural: true,
  animationSpeed: 2.0,
  colorAdjustment: { r: 0.8, g: 1.2, b: 0.9 }
})
app.add(proceduralSplat)

// Interactive testing commands
app.on('chat', (message) => {
  const parts = message.text.split(' ')
  const command = parts[0]
  const value = parseFloat(parts[1])
  
  switch (command) {
    case '/maxsplats':
      if (value && value > 0) {
        advancedSplat.maxSplats = Math.floor(value)
        console.log(`🎛️ Max splats set to: ${advancedSplat.maxSplats}`)
      }
      break
      
    case '/alphatest':
      if (value >= 0 && value <= 1) {
        advancedSplat.alphaTest = value
        console.log(`🎛️ Alpha test set to: ${advancedSplat.alphaTest}`)
      }
      break
      
    case '/colorred':
      if (value >= 0 && value <= 2) {
        const adj = advancedSplat.colorAdjustment
        advancedSplat.colorAdjustment = { r: value, g: adj.g, b: adj.b }
        console.log(`🎛️ Red adjustment set to: ${value}`)
      }
      break
      
    case '/colorgreen':
      if (value >= 0 && value <= 2) {
        const adj = advancedSplat.colorAdjustment
        advancedSplat.colorAdjustment = { r: adj.r, g: value, b: adj.b }
        console.log(`🎛️ Green adjustment set to: ${value}`)
      }
      break
      
    case '/colorblue':
      if (value >= 0 && value <= 2) {
        const adj = advancedSplat.colorAdjustment
        advancedSplat.colorAdjustment = { r: adj.r, g: adj.g, b: value }
        console.log(`🎛️ Blue adjustment set to: ${value}`)
      }
      break
      
    case '/animspeed':
      if (value > 0) {
        proceduralSplat.animationSpeed = value
        console.log(`🎛️ Animation speed set to: ${proceduralSplat.animationSpeed}`)
      }
      break
      
    case '/shader':
      advancedSplat.useShaderMaterial = !advancedSplat.useShaderMaterial
      console.log(`🎛️ Shader material: ${advancedSplat.useShaderMaterial ? 'enabled' : 'disabled'}`)
      break
      
    case '/worker':
      advancedSplat.sortingWorkerEnabled = !advancedSplat.sortingWorkerEnabled
      console.log(`🎛️ Worker sorting: ${advancedSplat.sortingWorkerEnabled ? 'enabled' : 'disabled'}`)
      break
      
    case '/procedural':
      proceduralSplat.procedural = !proceduralSplat.procedural
      console.log(`🎛️ Procedural mode: ${proceduralSplat.procedural ? 'enabled' : 'disabled'}`)
      break
      
    case '/advanced-help':
      console.log('🚀 Advanced Spark.js Commands:')
      console.log('/maxsplats [number] - Set max splat count')
      console.log('/alphatest [0-1] - Set alpha test threshold')
      console.log('/colorred [0-2] - Adjust red channel')
      console.log('/colorgreen [0-2] - Adjust green channel')
      console.log('/colorblue [0-2] - Adjust blue channel')
      console.log('/animspeed [number] - Set animation speed')
      console.log('/shader - Toggle shader material')
      console.log('/worker - Toggle worker sorting')
      console.log('/procedural - Toggle procedural mode')
      break
  }
})

// Monitor all splats' loading states
let lastStates = {}
app.on('update', () => {
  const splats = [
    { name: 'basic', splat: basicSplat },
    { name: 'advanced', splat: advancedSplat },
    { name: 'procedural', splat: proceduralSplat }
  ]
  
  splats.forEach(({ name, splat }) => {
    if (splat.loadingState !== lastStates[name]) {
      lastStates[name] = splat.loadingState
      console.log(`🔄 ${name} splat state: ${splat.loadingState}`)
      
      if (splat.loadingState === 'loaded') {
        console.log(`✅ ${name} splat loaded with advanced Spark.js features!`)
      } else if (splat.loadingState === 'error') {
        console.log(`❌ ${name} splat failed to load`)
      }
    }
  })
})

console.log('🌟 Advanced Spark.js test loaded!')
console.log('💡 Type /advanced-help in chat for commands')
console.log('🔬 Testing: max splats, alpha test, color adjustment, procedural, worker sorting')
console.log('🎨 Three splats: basic (center), advanced (right), procedural (left)')

}