// Mounts the app's real BrainScene for the prototype and exposes it as window.NFBrain.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import BrainScene from '../../src/components/Brain/BrainScene'
import { setThemeId } from './theme-stub'

let root = null
let props = { showContentEdges: true, onOpenNote() {}, onOpenGroup() {}, onNodeActivate() {} }
const v = new THREE.Vector3()
const api = {
  mount(el, p) { root = createRoot(el); api.update(p) },
  update(p) { props = { ...props, ...p }; root?.render(createElement(BrainScene, props)) },
  setTheme: setThemeId,
  handle: () => window.__nfBrain,
  // Screen position of a graph node inside the scene's canvas, and whether it faces the camera.
  project(id) {
    const h = window.__nfBrain; if (!h) return null
    const nd = h.data().byId.get(id); if (!nd) return null
    const c = h.renderer.domElement, W = c.clientWidth, H = c.clientHeight
    v.set(nd.x, nd.y, nd.z).project(h.camera)
    const t = h.controls.target, cam = h.camera.position
    const front = (nd.x - t.x) * (cam.x - t.x) + (nd.y - t.y) * (cam.y - t.y) + (nd.z - t.z) * (cam.z - t.z) > 0
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, front }
  },
}
window.NFBrain = api
