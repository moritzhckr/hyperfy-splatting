// import 'ses'
// import '../core/lockdown'
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { css } from '@firebolt-dev/css'

import { createClientWorld } from '../core/createClientWorld'
import { CoreUI } from './components/CoreUI'
import { storage } from '../core/storage'

export { System } from '../core/systems/System'

export function Client({ wsUrl, onSetup }) {
  const viewportRef = useRef()
  const cssLayerRef = useRef()
  const uiRef = useRef()
  const world = useMemo(() => createClientWorld(), [])
  const [ui, setUI] = useState(world.ui.state)
  useEffect(() => {
    world.on('ui', setUI)
    return () => {
      world.off('ui', setUI)
    }
  }, [])
  useEffect(() => {
    const init = async () => {
      const viewport = viewportRef.current
      const cssLayer = cssLayerRef.current
      const ui = uiRef.current
      const baseEnvironment = {
        model: '/base-environment.glb',
        bg: null, // '/day2-2k.jpg',
        hdr: '/Clear_08_4pm_LDR.hdr',
        rotationY: 0,
        sunDirection: new THREE.Vector3(-1, -2, -2).normalize(),
        sunIntensity: 1,
        sunColor: 0xffffff,
        fogNear: null,
        fogFar: null,
        fogColor: null,
      }
      if (typeof wsUrl === 'function') {
        wsUrl = wsUrl()
        if (wsUrl instanceof Promise) wsUrl = await wsUrl
      }

      // Read auth parameters from URL (set by Auth Gateway redirect)
      const urlParams = new URLSearchParams(window.location.search)
      const authToken = urlParams.get('authToken')
      const urlName = urlParams.get('name')
      const urlAvatar = urlParams.get('avatar')

      // Store auth token if provided in URL
      if (authToken) {
        storage.set('authToken', authToken)
      }
      // Store name if provided (for display and reconnection)
      if (urlName) {
        storage.set('name', urlName)
      }
      // Store avatar if provided
      if (urlAvatar) {
        storage.set('avatar', urlAvatar)
      }

      // Clean URL to remove auth params (security)
      if (authToken || urlName || urlAvatar) {
        window.history.replaceState({}, '', window.location.pathname)
      }

      // Use URL values or fall back to stored values
      const name = urlName || storage.get('name')
      const avatar = urlAvatar || storage.get('avatar')

      const config = { viewport, cssLayer, ui, wsUrl, baseEnvironment, name, avatar }
      onSetup?.(world, config)
      world.init(config)
    }
    init()
  }, [])
  return (
    <div
      className='App'
      css={css`
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 100vh;
        height: 100dvh;
        .App__viewport {
          position: absolute;
          inset: 0;
        }
        .App__cssLayer {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }
        .App__ui {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          user-select: none;
          display: ${ui.visible ? 'block' : 'none'};
        }
      `}
    >
      <div className='App__viewport' ref={viewportRef}>
        <div className='App__cssLayer' ref={cssLayerRef} />
        <div className='App__ui' ref={uiRef}>
          <CoreUI world={world} />
        </div>
      </div>
    </div>
  )
}
