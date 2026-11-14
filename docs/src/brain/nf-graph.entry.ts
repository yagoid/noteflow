// Entry of public/brain/nf-graph.js (bundled by docs/scripts/build-brain.mjs): everything the
// scene in public/brain/nf-brain.js needs besides the mesh and three.js itself.
//   window.NF.graph — the sample graph, the vertex assignment, the derived scene data, the segment
//                     buffers and the palette reader.
//   window.NF.look  — the approved look and budgets (BRAIN_LOOK, BRAIN_BUDGET, …) and the GLSL.
// Nothing here imports a value from ./mesh, so the mesh code is not bundled twice.

import { assignVertices } from './assign'
import { FLAG_CONTENT, FLAG_INTERIOR, opacityFlags, SegmentBuffer, toU8 } from './buffers'
import {
  buildBrainData, entranceCoords, fibre, focusMask, NODE_TIER, outwardFaces, strongestEdges,
  TIER_FOLDER, TIER_GROUP, TIER_NOTE, TIER_SECTION,
} from './data'
import { BRAIN_BUDGET, BRAIN_LOOK, CENTER_SIZE, RING_SIZE, softNode } from './look'
import { readBrainPalette } from './palette'
import { buildSampleGraph } from './sampleGraph'
import { DOT_FS, DOT_VS, GRADE_FS, GRADE_VS, LINE_FS, LINE_VS, NODE_FS, NODE_VS } from './shaders'

const host = window as unknown as { NF?: Record<string, unknown> }
const NF = (host.NF = host.NF || {})
NF.graph = {
  buildSampleGraph, assignVertices, buildBrainData, strongestEdges, focusMask, entranceCoords, outwardFaces, fibre,
  NODE_TIER, TIER_GROUP, TIER_FOLDER, TIER_NOTE, TIER_SECTION,
  SegmentBuffer, FLAG_INTERIOR, FLAG_CONTENT, opacityFlags, toU8,
  readBrainPalette,
}
NF.look = {
  BRAIN_LOOK, BRAIN_BUDGET, RING_SIZE, CENTER_SIZE, softNode,
  shaders: { LINE_VS, LINE_FS, DOT_VS, DOT_FS, NODE_VS, NODE_FS, GRADE_VS, GRADE_FS },
}
