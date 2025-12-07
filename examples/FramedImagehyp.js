// Image + Primitive Frame
// + Frame/Backboard glow
// + Collider modes: Off, Panel only, Frame only, Both
// + Z-fighting fix: backboard slightly behind image; image transparency obeys toggle
// + Collider depth: frame colliders use frameDepth; panel collider can optionally be thin (0.02m)
// + Auto vertical offset = rim thickness (t) when frame is enabled (keeps bottom bar above ground)

app.configure([
    { key: 'placeholder', type: 'file', kind: 'image', label: 'Placeholder', hidden: true },
    { key: 'image', type: 'file', kind: 'image', label: 'Image', hint: 'The image to display.' },
  
    { key: 'surface', type: 'section', label: 'Surface' },
    { key: 'width', type: 'number', label: 'Width', dp: 1, step: 0.1, bigStep: 1, initial: 0,
      hint: '0 = auto from height & aspect' },
    { key: 'height', type: 'number', label: 'Height', dp: 1, step: 0.1, bigStep: 1, initial: 1,
      hint: '0 = auto from width & aspect' },
    { key: 'fit', type: 'switch', label: 'Fit',
      options: [
        { label: 'Stretch', value: 'none' },
        { label: 'Cover',  value: 'cover' },
        { label: 'Contain',value: 'contain' },
      ],
      initial: 'none' },
    { key: 'transparent', type: 'toggle', label: 'Transparent' },
    { key: 'lit', type: 'toggle', label: 'Lit' },
    { key: 'shadows', type: 'toggle', label: 'Shadows' },
  
    { key: 'frame', type: 'section', label: 'Frame' },
    { key: 'frameEnabled', type: 'toggle', label: 'Enable Frame', initial: true },
    { key: 'frameThickness', type: 'number', label: 'Rim Thickness (m)', dp: 3, step: 0.005, bigStep: 0.05, initial: 0.1 },
    { key: 'frameDepth', type: 'number', label: 'Depth (m)', dp: 3, step: 0.005, bigStep: 0.05, initial: 0.2 },
    { key: 'frameZOffset', type: 'number', label: 'Z Offset (m)', dp: 3, step: 0.005, bigStep: 0.05, initial: 0.02 },
    { key: 'frameColor', type: 'color', label: 'Frame Color', initial: '#000000' },
    { key: 'frameCastShadow', type: 'toggle', label: 'Frame Casts Shadow', initial: true },
    { key: 'frameReceiveShadow', type: 'toggle', label: 'Frame Receives Shadow', initial: true },
  
    // Frame glow
    { key: 'frameGlow', type: 'toggle', label: 'Frame Glow (Emissive)', initial: false },
    { key: 'frameGlowIntensity', type: 'range', label: 'Glow Intensity', min: 0, max: 50, step: 0.1, initial: 1.5 },
    { key: 'frameGlowColor', type: 'color', label: 'Glow Color', initial: '#B91C1C' },
  
    // Backboard
    { key: 'backboardSection', type: 'section', label: 'Backboard' },
    { key: 'frameBackboard', type: 'toggle', label: 'Add Backboard', initial: false },
    { key: 'backboardColor', type: 'color', label: 'Backboard Color', initial: '#000000' },
    { key: 'backboardGlow', type: 'toggle', label: 'Backboard Affected by Glow', initial: false },
  
    // Collider
    { key: 'colliderSection', type: 'section', label: 'Collider' },
    {
      key: 'colliderMode',
      type: 'switch',
      label: 'Collider Mode',
      options: [
        { label: 'Off', value: 'off' },
        { label: 'Panel only', value: 'panel' },
        { label: 'Frame only', value: 'frame' },
        { label: 'Both', value: 'both' },
      ],
      initial: 'both',
    },
    { key: 'panelThin', type: 'toggle', label: 'Use Thin Panel Collider', initial: false },
  
    // Disco Mode
    { key: 'discoSection', type: 'section', label: 'Disco Mode' },
    { key: 'disco', type: 'toggle', label: 'Enable Disco (Emissive only)', initial: false },
    { key: 'discoSpeed', type: 'range', label: 'Speed (cycles/sec)', min: 0, max: 2, step: 0.05, initial: 0.25 },
    {
      key: 'discoTarget',
      type: 'switch',
      label: 'Target',
      options: [
        { label: 'Frame', value: 'frame' },
        { label: 'Backboard', value: 'back' },
        { label: 'Both', value: 'both' },
      ],
      initial: 'frame',
    },
  
    { key: 'rebuild', type: 'button', label: 'Rebuild', onClick: () => app.send('rebuildFrame') },
  ])
  
  app.keepActive = true
  
  // ── Image
  const src = props.image?.url || props.placeholder?.url
  const widthProp  = props.width === 0 ? null : props.width
  const heightProp = props.height === 0 ? null : props.height
  
  const oldSurface = app.get('Surface')
  app.remove(oldSurface)
  
  const image = app.create('image')
  image.pivot = 'bottom-center'
  image.src = src
  image.width = widthProp
  image.height = heightProp
  image.fit = props.fit
  image.color = props.transparent ? 'transparent' : 'black'
  image.transparent = !!props.transparent // only transparent if requested
  image.doubleside = true
  image.lit = props.lit
  image.castShadow = props.shadows
  image.receiveShadow = props.shadows
  app.add(image)
  
  // ── Frame props
  const frameEnabled = !!props.frameEnabled
  const t = Math.max(0, props.frameThickness ?? 0.1) // bar thickness (Y for horizontals)
  const d = Math.max(0, props.frameDepth ?? 0.2)     // bar depth (Z) — used for visuals and colliders (rim)
  const zOff = props.frameZOffset ?? 0.02
  const frameColor = props.frameColor || '#000000'
  const fCast = props.frameCastShadow ?? true
  const fRecv = props.frameReceiveShadow ?? true
  
  // ── Glow
  const frameGlow = !!props.frameGlow
  const frameGlowIntensity = Math.max(0, Math.min(50, props.frameGlowIntensity ?? 1.5))
  const frameGlowColor = props.frameGlowColor || frameColor
  
  // ── Backboard props
  const wantBack = !!props.frameBackboard
  const backboardColor = props.backboardColor || '#000000'
  const backboardGlow = !!props.backboardGlow
  
  // ── Collider props & nodes
  const colliderMode = props.colliderMode || 'both'
  const useThinPanel = !!props.panelThin
  const PANEL_THIN_Z = 0.02
  
  let rb = null
  let colPanel = null, colBottom = null, colTop = null, colLeft = null, colRight = null
  
  function clearColliderNode(n){ if (n){ app.remove(n); return null } return null }
  
  function ensureRigidBody(on){
    if (!on){
      colPanel = clearColliderNode(colPanel)
      colBottom = clearColliderNode(colBottom)
      colTop = clearColliderNode(colTop)
      colLeft = clearColliderNode(colLeft)
      colRight = clearColliderNode(colRight)
      rb = clearColliderNode(rb)
      return
    }
    if (!rb){
      rb = app.create('rigidbody')
      rb.type = 'static'
      app.add(rb)
    }
  }
  
  function ensurePanelCollider(){
    if (!colPanel){ colPanel = app.create('collider'); colPanel.type = 'box'; rb.add(colPanel) }
  }
  function ensureFrameColliders(){
    if (!colBottom){ colBottom = app.create('collider'); colBottom.type = 'box'; rb.add(colBottom) }
    if (!colTop){ colTop = app.create('collider'); colTop.type = 'box'; rb.add(colTop) }
    if (!colLeft){ colLeft = app.create('collider'); colLeft.type = 'box'; rb.add(colLeft) }
    if (!colRight){ colRight = app.create('collider'); colRight.type = 'box'; rb.add(colRight) }
  }
  function removePanelCollider(){ colPanel = clearColliderNode(colPanel) }
  function removeFrameColliders(){
    colBottom = clearColliderNode(colBottom)
    colTop = clearColliderNode(colTop)
    colLeft = clearColliderNode(colLeft)
    colRight = clearColliderNode(colRight)
  }
  
  // ── Frame prims
  function makeBox() {
    const n = app.create('prim', {
      type: 'box',
      scale: [1,1,1],
      position: [0,0,0],
      color: frameColor,
      castShadow: fCast,
      receiveShadow: fRecv,
      doubleside: false,
      metalness: 0,
      roughness: 1,
    })
    app.add(n)
    return n
  }
  let topBar = null, bottomBar = null, leftBar = null, rightBar = null, backBoard = null
  function ensureBars() {
    if (!topBar)    topBar    = makeBox()
    if (!bottomBar) bottomBar = makeBox()
    if (!leftBar)   leftBar   = makeBox()
    if (!rightBar)  rightBar  = makeBox()
    if (wantBack) {
      if (!backBoard) backBoard = makeBox()
    } else if (backBoard) {
      app.remove(backBoard); backBoard = null
    }
  }
  
  // ── Style helpers
  function styleBar(n){
    n.color = frameColor
    n.castShadow = fCast
    n.receiveShadow = fRecv
    if (frameGlow) {
      n.emissive = frameGlowColor
      n.emissiveIntensity = frameGlowIntensity
    } else {
      n.emissive = null
      n.emissiveIntensity = 0
    }
    n.visible = true
  }
  function styleBackboard(n){
    n.color = backboardColor
    n.castShadow = fCast
    n.receiveShadow = fRecv
    if (backboardGlow) {
      n.emissive = backboardColor
      n.emissiveIntensity = frameGlowIntensity
    } else {
      n.emissive = null
      n.emissiveIntensity = 0
    }
    n.visible = true
  }
  
  // ── Size resolution (props; square fallback)
  function resolveSurfaceSize() {
    let W = widthProp ?? 0
    let H = heightProp ?? 0
    if (W > 0 && H > 0) return { W, H }
    if (H > 0 && !W)    return { W: H, H }
    if (W > 0 && !H)    return { W, H: W }
    return { W: 1, H: 1 }
  }
  
  // ── Build (center-origin prims) — top/bottom outside, corners solid, BB behind image
  function rebuildFrameNow() {
    const { W, H } = resolveSurfaceSize()
    const z = zOff
    const baseY = frameEnabled ? t : 0  // << lift whole composition by rim thickness when frame is on
  
    // move the image up by baseY (bottom-center pivot → bottom now at baseY)
    image.position.set(0, baseY, 0)
  
    // ▸ Visual frame/backboard
    if (!frameEnabled) {
      if (topBar) topBar.visible = false
      if (bottomBar) bottomBar.visible = false
      if (leftBar) leftBar.visible = false
      if (rightBar) rightBar.visible = false
      if (backBoard) backBoard.visible = false
    } else {
      ensureBars()
  
      const horizLen = Math.max(0.001, W + 2 * t)
      const sideLen  = Math.max(0.001, H)
      const halfW = W / 2
  
      bottomBar.scale.set(horizLen, t, d)
      bottomBar.position.set(0, baseY - t/2, z)
      styleBar(bottomBar)
  
      topBar.scale.set(horizLen, t, d)
      topBar.position.set(0, baseY + H + t/2, z)
      styleBar(topBar)
  
      leftBar.scale.set(t, sideLen, d)
      leftBar.position.set(-(halfW + t/2), baseY + H/2, z)
      styleBar(leftBar)
  
      rightBar.scale.set(t, sideLen, d)
      rightBar.position.set(+(halfW + t/2), baseY + H/2, z)
      styleBar(rightBar)
  
      // Backboard — slightly behind image to avoid z-fighting
      if (backBoard) {
        const bb = Math.max(0.001, d * 0.5)
        const BB_EPS = 0.001
        backBoard.scale.set(W, H, bb)
        backBoard.position.set(0, baseY + H/2, -BB_EPS - bb/2)
        styleBackboard(backBoard)
      }
    }
  
    // ▸ Colliders (single static rigidbody with up to 5 children)
    const wantPanel = colliderMode === 'panel' || colliderMode === 'both'
    const wantFrame = (colliderMode === 'frame' || colliderMode === 'both') && frameEnabled
  
    if (!wantPanel && !wantFrame) {
      ensureRigidBody(false)
    } else {
      ensureRigidBody(true)
  
      if (wantPanel) {
        ensurePanelCollider()
        const panelZ = useThinPanel ? 0.02 : d
        colPanel.setSize(W, H, panelZ)
        colPanel.position.set(0, baseY + H/2, 0)
      } else {
        removePanelCollider()
      }
  
      if (wantFrame) {
        ensureFrameColliders()
        const horizLen = Math.max(0.001, W + 2 * t)
        const sideLen  = Math.max(0.001, H)
        const halfW = W / 2
  
        colBottom.setSize(horizLen, t, d)
        colBottom.position.set(0, baseY - t/2, z)
  
        colTop.setSize(horizLen, t, d)
        colTop.position.set(0, baseY + H + t/2, z)
  
        colLeft.setSize(t, sideLen, d)
        colLeft.position.set(-(halfW + t/2), baseY + H/2, z)
  
        colRight.setSize(t, sideLen, d)
        colRight.position.set(+(halfW + t/2), baseY + H/2, z)
      } else {
        removeFrameColliders()
      }
    }
  }
  
  // ── Disco mode internals (local timer, emissive only)
  let discoTime = 0
  let discoWasActive = false
  
  function hsvToHex(h, s, v) {
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c
    let r=0, g=0, b=0
    if      (h < 60 ) { r=c; g=x; b=0 }
    else if (h < 120) { r=x; g=c; b=0 }
    else if (h < 180) { r=0; g=c; b=x }
    else if (h < 240) { r=0; g=x; b=c }
    else if (h < 300) { r=x; g=0; b=c }
    else              { r=c; g=0; b=x }
    const R = Math.round((r + m) * 255)
    const G = Math.round((g + m) * 255)
    const B = Math.round((b + m) * 255)
    const toHex = n => n.toString(16).padStart(2, '0')
    return `#${toHex(R)}${toHex(G)}${toHex(B)}`
  }
  
  app.on('update', dt => {
    const disco = !!props.disco
    if (!disco) {
      if (discoWasActive) {
        if (frameEnabled) {
          if (topBar)    { topBar.emissive    = frameGlow ? frameGlowColor : null; topBar.emissiveIntensity    = frameGlow ? frameGlowIntensity : 0 }
          if (bottomBar) { bottomBar.emissive = frameGlow ? frameGlowColor : null; bottomBar.emissiveIntensity = frameGlow ? frameGlowIntensity : 0 }
          if (leftBar)   { leftBar.emissive   = frameGlow ? frameGlowColor : null; leftBar.emissiveIntensity   = frameGlow ? frameGlowIntensity : 0 }
          if (rightBar)  { rightBar.emissive  = frameGlow ? frameGlowColor : null; rightBar.emissiveIntensity  = frameGlow ? frameGlowIntensity : 0 }
        }
        if (backBoard) {
          backBoard.emissive = backboardGlow ? backboardColor : null
          backBoard.emissiveIntensity = backboardGlow ? frameGlowIntensity : 0
        }
        discoWasActive = false
      }
      return
    }
  
    discoWasActive = true
    const cps = Math.max(0, Math.min(2, props.discoSpeed ?? 0.25)) // cycles per second
    discoTime += dt * cps
    let hue = (discoTime * 360) % 360
    const discoColor = hsvToHex(hue, 1, 1)
  
    const target = props.discoTarget || 'frame'
    if ((target === 'frame' || target === 'both') && frameEnabled && frameGlow) {
      if (topBar)    { topBar.emissive    = discoColor; topBar.emissiveIntensity    = frameGlowIntensity }
      if (bottomBar) { bottomBar.emissive = discoColor; bottomBar.emissiveIntensity = frameGlowIntensity }
      if (leftBar)   { leftBar.emissive   = discoColor; leftBar.emissiveIntensity   = frameGlowIntensity }
      if (rightBar)  { rightBar.emissive  = discoColor; rightBar.emissiveIntensity  = frameGlowIntensity }
    }
    if ((target === 'back' || target === 'both') && backBoard && backboardGlow) {
      backBoard.emissive = discoColor
      backBoard.emissiveIntensity = frameGlowIntensity
    }
  })
  
  // ── Initial build + manual button
  rebuildFrameNow()
  app.on('rebuildFrame', rebuildFrameNow)
  