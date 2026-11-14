// A curated example brain for the landing page. Same shape as what the app's useBrainGraph builds
// from real notes — structure layer group → folder → note → section (a group's own notes first,
// then its folders, like the sidebar), content layer note ↔ note similarities, plus a few explicit
// user relations — but hand-authored so it reads as a believable developer's second brain.
//
// The note ids are a contract: the chat mock of Home.astro cites them (`cites`, NAV_BRAIN).

import type { BrainContentEdge, BrainGraphModel, BrainNode, BrainRelationEdge, BrainStructureEdge, GroupColor } from './graph'

interface NoteSpec {
  id: string
  label: string
  sections?: string[]
  favorited?: boolean
}

export function buildSampleGraph(): BrainGraphModel {
  const nodes: BrainNode[] = []
  const structureEdges: BrainStructureEdge[] = []
  const contentEdges: BrainContentEdge[] = []
  const relationEdges: BrainRelationEdge[] = []

  const addNote = (spec: NoteSpec, colorVar: GroupColor, parentId?: string, groupId?: string): string => {
    const id = `n:${spec.id}`
    const sections = spec.sections ?? []
    nodes.push({
      id, kind: 'note', label: spec.label, colorVar, refId: spec.id, noteId: spec.id,
      sectionId: `${spec.id}-s0`, favorited: spec.favorited, groupId,
    })
    if (parentId) structureEdges.push({ source: parentId, target: id })
    // A single-section note collapses to its soma (as in the app); 2+ sections become dendrites.
    if (sections.length >= 2) {
      sections.forEach((name, i) => {
        const sid = `s:${spec.id}-s${i}`
        nodes.push({
          id: sid, kind: 'section', label: name, colorVar, refId: `${spec.id}-s${i}`, noteId: spec.id,
          sectionId: `${spec.id}-s${i}`, favorited: spec.favorited, groupId,
        })
        structureEdges.push({ source: id, target: sid })
      })
    }
    return id
  }
  const addGroup = (gid: string, name: string, colorVar: GroupColor, notes: NoteSpec[], folders: Array<[string, string, NoteSpec[]]> = [], centered = false) => {
    const id = `g:${gid}`
    const node: BrainNode = { id, kind: 'group', label: name, colorVar, refId: gid }
    if (centered) node.centered = true
    nodes.push(node)
    for (const spec of notes) addNote(spec, colorVar, id, id)
    for (const [fid, fname, fnotes] of folders) {
      const folderId = `f:${fid}`
      nodes.push({ id: folderId, kind: 'folder', label: fname, colorVar, refId: fid, groupId: id })
      structureEdges.push({ source: id, target: folderId })
      for (const spec of fnotes) addNote(spec, colorVar, folderId, id)
    }
  }

  // Second brain: the AI-generated profile ("IA Generated", the app's AI group). It sits at the
  // core of the brain, with relations radiating out to every topic it was inferred from.
  addGroup('ai-generated', 'IA Generated', '--text', [{ id: 'profile', label: 'Your profile' }], [], true)

  addGroup('eng', 'Engineering', '--accent', [
    { id: 'k8s', label: 'Kubernetes cheatsheet' },
    { id: 'docker', label: 'Docker recipes' },
  ], [
    ['eng-fe', 'Frontend', [
      { id: 'react-patterns', label: 'React patterns', sections: ['Hooks', 'Performance', 'State'] },
      { id: 'css-arch', label: 'CSS architecture' },
      { id: 'ts-tips', label: 'TypeScript tips' },
    ]],
    ['eng-be', 'Backend', [
      { id: 'postgres', label: 'Postgres notes', sections: ['Indexes', 'Query plans'] },
      { id: 'rust-async', label: 'Rust async' },
      { id: 'redis', label: 'Redis caching' },
    ]],
    ['eng-tools', 'Tooling', [
      { id: 'git-workflow', label: 'Git workflow', sections: ['Branching', 'Rebase'] },
      { id: 'vim-config', label: 'Neovim config' },
    ]],
  ])
  addGroup('research', 'Research', '--purple', [
    { id: 'rag', label: 'RAG architectures', sections: ['Retrieval', 'Reranking'] },
    { id: 'embeddings', label: 'Embeddings', sections: ['Models', 'Quantization'] },
    { id: 'agents', label: 'Agentic loops' },
    { id: 'eval', label: 'LLM evaluation' },
    { id: 'vector-db', label: 'Vector databases' },
  ], [
    ['research-papers', 'Papers', [
      { id: 'attention-paper', label: 'Attention is all you need' },
      { id: 'rlhf', label: 'RLHF notes', sections: ['Reward models', 'PPO'] },
    ]],
  ])
  addGroup('product', 'Product', '--accent-2', [
    { id: 'roadmap', label: 'Q3 roadmap' },
    { id: 'pricing', label: 'Pricing experiments' },
    { id: 'feedback', label: 'User feedback' },
    { id: 'onboarding', label: 'Onboarding flow', sections: ['Signup', 'First note', 'Activation'] },
    { id: 'metrics', label: 'Product metrics' },
    { id: 'competitors', label: 'Competitor notes' },
  ])
  addGroup('writing', 'Writing', '--orange', [
    { id: 'blog-brain', label: 'Blog: second brain' },
    { id: 'newsletter', label: 'Newsletter ideas' },
    { id: 'talk-draft', label: 'Conference talk draft', sections: ['Outline', 'Demo'] },
    { id: 'style-guide', label: 'Style guide' },
  ])
  addGroup('design', 'Design', '--pink', [
    { id: 'design-system', label: 'Design system', sections: ['Tokens', 'Components', 'Motion'] },
    { id: 'brain-ui', label: 'Brain view mockups' },
  ], [
    ['design-inspo', 'Inspiration', [
      { id: 'typography', label: 'Typography' },
      { id: 'color-palettes', label: 'Color palettes' },
    ]],
  ])
  addGroup('learning', 'Learning', '--cyan', [
    { id: 'system-design', label: 'System design', sections: ['Caching', 'Queues', 'Sharding'] },
    { id: 'spaced-rep', label: 'Spaced repetition' },
  ], [
    ['learning-courses', 'Courses', [
      { id: 'rust-book', label: 'Rust book notes', sections: ['Ownership', 'Lifetimes'] },
      { id: 'sql-course', label: 'SQL course' },
    ]],
  ])
  addGroup('personal', 'Personal', '--red', [
    { id: 'health', label: 'Health log', sections: ['Sleep', 'Training'] },
    { id: 'finances', label: 'Finances' },
    { id: 'trips', label: 'Trip planning' },
  ], [
    ['personal-home', 'Home', [
      { id: 'recipes', label: 'Recipes' },
    ]],
  ])

  // Ungrouped notes (neutral --text); the favourites go to the cerebellum.
  addNote({ id: 'reading', label: 'Reading list', favorited: true }, '--text')
  addNote({ id: 'quotes', label: 'Quotes', favorited: true }, '--text')
  addNote({ id: 'daily', label: 'Daily log' }, '--text')
  addNote({ id: 'ideas', label: 'Random ideas' }, '--text')
  addNote({ id: 'meeting-notes', label: 'Meeting notes' }, '--text')
  addNote({ id: 'inbox', label: 'Inbox', favorited: true }, '--text')

  // Content layer: what the AI index would relate, cross-topic.
  const rel: Array<[string, string, number]> = [
    ['rag', 'embeddings', 0.92], ['rag', 'agents', 0.84], ['agents', 'eval', 0.71],
    ['rag', 'blog-brain', 0.68], ['agents', 'blog-brain', 0.66], ['react-patterns', 'css-arch', 0.74],
    ['postgres', 'rust-async', 0.6], ['rust-async', 'k8s', 0.55], ['embeddings', 'postgres', 0.5],
    ['roadmap', 'pricing', 0.7], ['roadmap', 'agents', 0.52], ['feedback', 'roadmap', 0.64],
    ['blog-brain', 'newsletter', 0.72], ['ideas', 'blog-brain', 0.6], ['reading', 'quotes', 0.5],
    ['daily', 'ideas', 0.46], ['eval', 'embeddings', 0.58],
    // engineering and research, grown
    ['docker', 'k8s', 0.76], ['ts-tips', 'react-patterns', 0.7], ['redis', 'postgres', 0.64],
    ['git-workflow', 'docker', 0.48], ['vim-config', 'git-workflow', 0.5],
    ['vector-db', 'embeddings', 0.86], ['vector-db', 'rag', 0.8], ['vector-db', 'postgres', 0.58],
    ['attention-paper', 'embeddings', 0.74], ['rlhf', 'eval', 0.69], ['rlhf', 'agents', 0.6],
    // product and writing, grown
    ['onboarding', 'feedback', 0.71], ['metrics', 'pricing', 0.66], ['competitors', 'roadmap', 0.6],
    ['talk-draft', 'blog-brain', 0.7], ['talk-draft', 'rag', 0.55], ['style-guide', 'newsletter', 0.6],
    // design
    ['design-system', 'css-arch', 0.78], ['design-system', 'react-patterns', 0.62], ['brain-ui', 'design-system', 0.7],
    ['brain-ui', 'blog-brain', 0.55], ['typography', 'color-palettes', 0.66], ['color-palettes', 'design-system', 0.6],
    ['onboarding', 'design-system', 0.5],
    // learning
    ['rust-book', 'rust-async', 0.82], ['sql-course', 'postgres', 0.8], ['system-design', 'redis', 0.68],
    ['system-design', 'k8s', 0.57], ['spaced-rep', 'reading', 0.52], ['spaced-rep', 'quotes', 0.45],
    // personal
    ['health', 'daily', 0.55], ['trips', 'daily', 0.44], ['recipes', 'health', 0.5], ['finances', 'pricing', 0.42],
    // loose notes
    ['meeting-notes', 'roadmap', 0.56], ['inbox', 'ideas', 0.62],
    // the profile at the core → a representative note of each topic
    ['profile', 'rag', 0.66], ['profile', 'blog-brain', 0.62], ['profile', 'react-patterns', 0.6],
    ['profile', 'roadmap', 0.58], ['profile', 'reading', 0.5], ['profile', 'daily', 0.48],
    ['profile', 'design-system', 0.55], ['profile', 'rust-book', 0.52], ['profile', 'health', 0.5],
  ]
  for (const [a, b, score] of rel) contentEdges.push({ source: `n:${a}`, target: `n:${b}`, score })

  // Explicit user relations (inline links between sections): they stay with the content layer off.
  relationEdges.push(
    { source: 's:react-patterns-s1', target: 'n:css-arch' },
    { source: 's:rag-s0', target: 's:postgres-s0' },
    { source: 'n:daily', target: 'n:roadmap' },
    { source: 's:design-system-s0', target: 'n:css-arch' },
    { source: 's:system-design-s0', target: 'n:redis' },
  )

  return { nodes, structureEdges, contentEdges, relationEdges }
}
