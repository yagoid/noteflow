// Fingerprint of the approved 3D brain (the prototype's `buildAnatomicalMesh(4, true)` +
// `assignCortex`), taken by running that prototype in Node. brainMesh.ts / assignVertices.ts are a
// port of it and must reproduce it exactly: same vertices, edges and routes, in the same order
// (tests/components/brainMesh.test.ts, assignVertices.test.ts).

import type { GroupColor } from '../../src/types'
import type { BrainGraphModel, BrainNode } from '../../src/components/Brain/useBrainGraph'

export const BRAIN_MESH_REF = {
  vertexCount: 4499,
  edges: 11684,
  faces: 5644,
  interior: 1665,
  cortex: 1315,
  kind: [4227, 200, 72],                       // cerebrum · cerebellum · brainstem
  regions: [2057, 997, 567, 606, 200, 72],     // in REGIONS order
  visibleEdges: 11652,                         // weight > 0
  outlineEdges: 1494,                          // weight >= 0.6
  center: [0, 0.42, 0],
  // the first 10 vertices (x, y, z), rounded to 5 decimals
  firstPositions: [
    -0.4004, 1.03989, -0.00292, 0.40439, 1.03766, -0.00348, -0.49376, -0.34742, 0,
    0.49376, -0.34742, 0, 0, 0.10199, 0.77858, 0, 0.71827, 0.73027,
    0, 0.01315, -0.9961, 0, 0.71684, -0.72676, 0.72443, 0.43233, -0.64396,
    0.63953, 0.42642, 0.58015,
  ],
  // SHA-1 of each array's raw bytes, whole (little-endian; taken from the prototype in Node 24 and
  // reproduced by the port in Node 24 and in Electron 35's V8). The samples below only pin the
  // first few entries; these pin every vertex, edge, face and weight — cerebellum and brainstem
  // included, which sit at the end of every array.
  sha: {
    positions: 'afac8dc354bec37ea39f11adb4ee697865923d57',
    edges: '56c0393f9f1c14fa24ae93e31cde930e1015b989',
    faces: '8cf059608c541e3890871ee980fe12a69e32612f',
    edgeW: 'dba24ea2a63e256c3ff363ec0c46aeb06b75e7fd',
    vertW: 'ad08238315149f9ffd60924a135c090bb04080bb',
    cortex: '3e039e850edc6a2c6389040e44c188e3255ebe4a',
    kind: '4c82bf7ad2eb137203224c28f9bb740877fd7371',
    regionOf: '89cf2b6a189dec2a08d330b7884aeaff2f7c884d',
  },
  // the first 10 edges (vertex pairs) and the first 30 edge weights
  firstEdges: [0, 642, 642, 644, 0, 644, 162, 643, 642, 643, 162, 642, 164, 644, 643, 644, 164, 643, 42, 645],
  firstEdgeW: [
    1, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 1, 0.3, 0.3, 1, 1, 0.045,
    0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3,
  ],
  // assignVertices(mesh, buildRefModel()), in insertion order
  assignment: [
    ['g:ai', 3294], ['n:profile', 2692], ['g:0', 1212], ['f:0', 2194], ['n:0-0', 2206], ['s:0-0-0', 565],
    ['s:0-0-1', 2204], ['s:0-0-2', 2193], ['n:0-1', 1177], ['n:0-2', 314], ['n:0-3', 2222], ['n:0-4', 2174],
    ['s:0-4-0', 312], ['s:0-4-1', 2175], ['s:0-4-2', 559], ['n:0-5', 558], ['n:0-6', 2218], ['n:0-7', 566],
    ['n:0-8', 1232], ['s:0-8-0', 316], ['s:0-8-1', 1231], ['s:0-8-2', 1229], ['g:1', 1505], ['f:1', 1533],
    ['n:1-0', 1479], ['s:1-0-0', 1480], ['s:1-0-1', 101], ['s:1-0-2', 1532], ['n:1-1', 1458], ['n:1-2', 2359],
    ['n:1-3', 1530], ['n:1-4', 1510], ['s:1-4-0', 389], ['s:1-4-1', 1511], ['s:1-4-2', 388], ['n:1-5', 374],
    ['n:1-6', 1526], ['n:1-7', 2324], ['n:1-8', 2389], ['s:1-8-0', 2363], ['s:1-8-1', 2360], ['s:1-8-2', 2362],
    ['g:2', 1364], ['f:2', 1433], ['n:2-0', 1378], ['s:2-0-0', 1380], ['s:2-0-1', 1379], ['s:2-0-2', 354],
    ['n:2-1', 1435], ['n:2-2', 1353], ['n:2-3', 1388], ['n:2-4', 1360], ['s:2-4-0', 349], ['s:2-4-1', 1359],
    ['s:2-4-2', 1361], ['n:2-5', 347], ['n:2-6', 356], ['n:2-7', 344], ['n:2-8', 1350], ['s:2-8-0', 346],
    ['s:2-8-1', 1349], ['s:2-8-2', 286], ['g:3', 2093], ['f:3', 2003], ['n:3-0', 2007], ['s:3-0-0', 2005],
    ['s:3-0-1', 139], ['s:3-0-2', 518], ['n:3-1', 2126], ['n:3-2', 2082], ['n:3-3', 8], ['n:3-4', 2097],
    ['s:3-4-0', 536], ['s:3-4-1', 2078], ['s:3-4-2', 2090], ['n:3-5', 2018], ['n:3-6', 2008], ['n:3-7', 2141],
    ['n:3-8', 537], ['s:3-8-0', 2080], ['s:3-8-1', 2079], ['s:3-8-2', 2084], ['g:4', 58], ['f:4', 0],
    ['n:4-0', 643], ['s:4-0-0', 162], ['s:4-0-1', 642], ['s:4-0-2', 644], ['n:4-1', 860], ['n:4-2', 874],
    ['n:4-3', 193], ['n:4-4', 871], ['s:4-4-0', 224], ['s:4-4-1', 870], ['s:4-4-2', 872], ['n:4-5', 863],
    ['n:4-6', 219], ['n:4-7', 945], ['n:4-8', 867], ['s:4-8-0', 59], ['s:4-8-1', 869], ['s:4-8-2', 868],
    ['n:loose0', 4392], ['n:loose1', 4310], ['n:loose2', 2443], ['n:loose3', 742], ['n:loose4', 636], ['n:loose5', 1317],
  ] as Array<[string, number]>,
  // pathBetween(g:0 → n:3-4) and pathThroughInterior(n:0-1 → n:4-7) on a mesh with empty caches
  path: {
    between: [1212, 312, 2174, 2175, 2165, 2166, 308, 1195, 1194, 2478, 543, 2102, 146, 2117, 2116, 2113, 548, 2131, 2132, 2084, 2082, 2096, 2097],
    interior: [1177, 1175, 301, 1180, 80, 1188, 305, 1185, 15, 822, 214, 826, 56, 816, 209, 811, 16, 857, 932, 935, 241, 949, 243, 945],
  },
}

const GROUP_COLORS: GroupColor[] = ['--accent', '--red', '--cyan', '--purple', '--orange']

/** A node with the fields the layout doesn't read filled in from its id. */
export function brainNode(node: Pick<BrainNode, 'id' | 'kind'> & Partial<BrainNode>): BrainNode {
  return { label: node.id, colorVar: '--text', refId: node.id.slice(2), ...node }
}

/**
 * The small graph the reference assignment was taken on: the AI group with its profile note, five
 * groups (one folder and nine notes each — every third note in the folder, every fourth with three
 * sections) and six loose notes, the first two favourited.
 */
export function buildRefModel(): BrainGraphModel {
  const model: BrainGraphModel = { nodes: [], structureEdges: [], contentEdges: [], relationEdges: [] }
  model.nodes.push(brainNode({ id: 'g:ai', kind: 'group', centered: true }))
  model.nodes.push(brainNode({ id: 'n:profile', kind: 'note', noteId: 'profile', groupId: 'g:ai' }))
  model.structureEdges.push({ source: 'g:ai', target: 'n:profile' })
  for (let g = 0; g < 5; g++) {
    const gid = `g:${g}`, fid = `f:${g}`, colorVar = GROUP_COLORS[g]
    model.nodes.push(brainNode({ id: gid, kind: 'group', colorVar }))
    model.nodes.push(brainNode({ id: fid, kind: 'folder', colorVar, groupId: gid }))
    model.structureEdges.push({ source: gid, target: fid })
    for (let i = 0; i < 9; i++) {
      const noteId = `${g}-${i}`, nid = `n:${noteId}`
      model.nodes.push(brainNode({ id: nid, kind: 'note', noteId, colorVar, groupId: gid }))
      model.structureEdges.push({ source: i % 3 === 0 ? fid : gid, target: nid })
      if (i % 4 !== 0) continue
      for (let s = 0; s < 3; s++) {
        const sid = `s:${noteId}-${s}`
        model.nodes.push(brainNode({ id: sid, kind: 'section', noteId, colorVar, groupId: gid }))
        model.structureEdges.push({ source: nid, target: sid })
      }
    }
  }
  for (let i = 0; i < 6; i++) model.nodes.push(brainNode({ id: `n:loose${i}`, kind: 'note', noteId: `loose${i}`, favorited: i < 2 }))
  return model
}
