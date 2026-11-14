// Entry of public/brain/nf-mesh.js (bundled by docs/scripts/build-brain.mjs): the fixed brain
// mesh, exposed as window.NF.mesh for the hand-written scene in public/brain/nf-brain.js.

import { buildBrainMesh, getBrainMesh, mulberry32, REGION_CODE, REGIONS } from './mesh'

const host = window as unknown as { NF?: Record<string, unknown> }
const NF = (host.NF = host.NF || {})
NF.mesh = { buildBrainMesh, getBrainMesh, mulberry32, REGIONS, REGION_CODE }
