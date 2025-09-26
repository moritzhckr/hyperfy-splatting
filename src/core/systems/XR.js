import { System } from './System'
import * as THREE from '../extras/three'

/**
 * XR System
 *
 * - Runs on the client.
 * - Keeps track of XR sessions
 *
 */
export class XR extends System {
  constructor(world) {
    super(world)
    this.session = null
    this.camera = null
    this.supportsVR = false
    this.supportsAR = false
  }

  async init() {
    this.supportsVR = await navigator.xr?.isSessionSupported('immersive-vr')
    this.supportsAR = await navigator.xr?.isSessionSupported('immersive-ar')
  }

  async enter() {
    this.world.graphics.renderer.xr.setReferenceSpaceType('local-floor')
    this.world.graphics.renderer.xr.setFoveation(1)
    const session = await navigator.xr?.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
    })
    try {
      session.updateTargetFrameRate(72)
    } catch (err) {
      console.error(err)
      console.error('xr session.updateTargetFrameRate(72) failed')
    }
    this.world.graphics.renderer.xr.setSession(session)
    session.addEventListener('end', this.onSessionEnd)
    this.camera = this.world.graphics.renderer.xr.getCamera()
    this.session = session
    this.world.emit('xrSession', session)
  }

  onSessionEnd = () => {
    this.session = null
    this.world.emit('xrSession', null)
  }
}
