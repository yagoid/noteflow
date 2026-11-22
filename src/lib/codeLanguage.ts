// Language auto-detection for code blocks without an explicit language.
//
// Deliberately simple and conservative: a handful of distinctive patterns per
// language, scored, and a language is only returned when the evidence is clear.
// A code block is often just plain text (a list, a note, a log line), so when
// in doubt the answer is `null` and the block stays unhighlighted.
//
// lowlight's own `highlightAuto` was not good enough for this: on short snippets
// it labels prose as CSS/R/C# and real JS as SCSS (relevance is tiny and noisy).

/** Ids (and aliases) that mean "plain text, no highlighting" — never auto-detected over. */
export const PLAIN_TEXT_IDS = new Set(['plaintext', 'text', 'txt', 'plain'])

/** Whether a stored code block language means "plain text". */
export function isPlainTextLanguage(language: string | null | undefined): boolean {
  return !!language && PLAIN_TEXT_IDS.has(language.toLowerCase())
}

// Shell commands. Many command names are also English words ("export the
// report", "touch base", "echo chamber", "git is great"), so a line only counts
// as a command if it has no prose words outside its quoted arguments and:
// - starts with a tool that is never a word (npm, cd, sudo…) followed by an arg,
// - or is `git <subcommand>`,
// - or starts with a word-like command (echo, export, rm…) and has a
//   command-like token: a -flag, a path, a pipe or &&, a $variable, a quoted
//   argument, a file extension or an assignment.
const SHELL_TOOLS = /^(sudo|apt|apt-get|brew|npm|npx|yarn|pnpm|pip|pip3|cd|ls|mkdir|chmod|chown|curl|wget|docker|kubectl)$/
const SHELL_WORDS = /^(echo|export|touch|source|rm|cp|mv|cat|ssh)$/
const GIT_SUBCOMMANDS = /^(init|clone|status|add|commit|push|pull|fetch|merge|rebase|checkout|switch|branch|log|diff|stash|reset|restore|tag|remote|show|cherry-pick)$/
const PROSE_WORDS = /\b(the|a|an|is|are|was|to|of|with|and|or|for|before|after|my|your|this|that|el|la|los|las|un|una|es|de|que|y|con|para|por)\b/i
const COMMAND_TOKEN = /(^|\s)--?\w|[/\\~]|&&|\||\$\w|["']|\.\w{1,4}\b|\w=/

function isShellCommandLine(line: string): boolean {
  const m = /^\s*(?:\$\s+)?([\w-]+)\s+(\S.*)$/.exec(line)
  if (!m) return false
  const [, command, rest] = m
  if (PROSE_WORDS.test(rest.replace(/"[^"]*"|'[^']*'/g, ''))) return false
  if (SHELL_TOOLS.test(command)) return true
  if (command === 'git') return GIT_SUBCOMMANDS.test(rest.split(/\s+/)[0])
  return SHELL_WORDS.test(command) && COMMAND_TOKEN.test(rest)
}

function hasShellCommandLine(text: string): boolean {
  return text.split(/\r?\n/).some(isShellCommandLine)
}

type Rule = [lang: string, pattern: RegExp | ((text: string) => boolean), weight: number]

// Each rule counts once (presence, not occurrences), so a long block doesn't run
// away with one pattern. Ids are lowlight's (`xml` covers HTML).
const RULES: Rule[] = [
  // JavaScript (TypeScript inherits these, see below)
  ['javascript', /\b(const|let)\s+[\w$]+\s*=/, 2],
  ['javascript', /\bconsole\.(log|error|warn|info)\(/, 3],
  ['javascript', /\bfunction\s*[\w$]*\s*\([^)]*\)\s*\{/, 2],
  ['javascript', /\b(require\(['"]|module\.exports|export\s+(default|const|function|class)\b|import\s+[\w${}*,\s]+\s+from\s+['"])/, 3],
  ['javascript', /\)\s*=>\s*[{(\w]/, 1],
  ['javascript', /\b(document|window)\.\w+/, 1],
  ['javascript', /===|!==/, 1],
  // TypeScript-only
  ['typescript', /\b(interface|type)\s+[A-Z]\w*\s*(<[^>]*>\s*)?(=|\{)/, 3],
  ['typescript', /[\w)?]\s*:\s*(string|number|boolean|any|void|unknown|never)(\[\])?\s*[,;)=|{]/, 2],
  ['typescript', /\bas\s+(const|string|number|any|unknown)\b/, 1],
  // Python
  ['python', /^\s*(async\s+)?def\s+\w+\s*\(.*\)\s*(->\s*[^:]+)?:\s*$/m, 3],
  ['python', /^\s*class\s+\w+(\(.*\))?:\s*$/m, 3],
  ['python', /^\s*(from\s+[\w.]+\s+import\s+[\w*]|import\s+[\w.]+(\s+as\s+\w+)?\s*$)/m, 2],
  // A block opener only counts with an indented body under it ("for the meeting:" is prose).
  ['python', /^\s*(if|elif|for|while|with|try|except|else)\b.*:[ \t]*\r?\n[ \t]+\S/m, 1],
  ['python', /\bself\.\w+/, 2],
  ['python', /\b(None|True|False)\b/, 1],
  ['python', /\bprint\(/, 1],
  // Shell
  ['bash', /^#!.*\b(ba|z)?sh\b/, 4],
  ['bash', hasShellCommandLine, 2],
  ['bash', /^\s*\$\s+\w/m, 1],
  ['bash', /\|\s*(grep|sed|awk|xargs|sort|uniq|head|tail|wc|tee)\b/, 2],
  ['bash', /^\s*(fi|done|esac)\s*$|\bthen\s*$/m, 2],
  // SQL (keywords in capitals only: lowercase "select one from the list" is prose)
  ['sql', /\bSELECT\s+[\w*,.\s()]+\s+FROM\s+\w/, 3],
  ['sql', /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|ALTER\s+TABLE|DROP\s+TABLE)\b/, 3],
  ['sql', /\b(WHERE|JOIN|GROUP BY|ORDER BY|VALUES)\b/, 1],
  // CSS
  ['css', /\b(color|background(-color)?|margin|padding|display|font-(size|family|weight)|border(-radius)?|width|height|position|flex|z-index)\s*:\s*[^;{}\n]+;/, 2],
  ['css', /(^|\s)[.#][\w-]+(\s*[,>+~]?\s*[.#:]?[\w-]+)*\s*\{/m, 1],
  ['css', /@(media|keyframes|import\s+url|font-face)\b/, 2],
  ['css', /^\s*--[\w-]+\s*:/m, 1],
  // HTML / XML
  ['xml', /<(!DOCTYPE|html|head|body|div|span|p|a|ul|ol|li|script|style|section|button|input|img|table|form)\b[^>]*>/i, 2],
  ['xml', /<\/\w+>/, 1],
  ['xml', /^\s*<\?xml\b/, 4],
  // Rust
  ['rust', /\bfn\s+\w+\s*(<[^>]*>)?\s*\(/, 2],
  ['rust', /\blet\s+mut\b/, 3],
  ['rust', /\b(println|vec|format|panic)!\(/, 3],
  ['rust', /\b(impl|pub\s+fn|use\s+\w+::)\b/, 2],
  // Go
  ['go', /^\s*package\s+\w+\s*$/m, 3],
  ['go', /\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/, 3],
  // `:=` alone ("name := value") is not enough: it needs another Go signal.
  ['go', /\w\s*:=\s*/, 1],
  ['go', /\bfmt\.\w+\(/, 3],
  // Java
  ['java', /\bSystem\.out\.print/, 3],
  ['java', /\bString\[\]\s+args\b/, 3],
  ['java', /^\s*(import\s+java\.|package\s+[\w.]+;)/m, 3],
  ['java', /@Override\b/, 2],
  // C#
  ['csharp', /^\s*using\s+System(\.\w+)*;/m, 3],
  ['csharp', /\bConsole\.Write(Line)?\(/, 3],
  ['csharp', /\{\s*get;\s*(set;)?\s*\}/, 3],
  ['csharp', /\bnamespace\s+[\w.]+/, 1],
  // C / C++ (C++ inherits the C ones, see below)
  ['c', /^\s*#include\s*[<"]/m, 3],
  ['c', /\bint\s+main\s*\(/, 2],
  ['c', /\bprintf\(/, 1],
  ['cpp', /\bstd::|\bcout\s*<<|\btemplate\s*</, 3],
  // PHP
  ['php', /<\?php/, 4],
  ['php', /\$this->/, 3],
  ['php', /\becho\s+\$\w/, 2],
  // Diff
  ['diff', /^@@ .* @@/m, 3],
  ['diff', /^diff --git\b/m, 3],
  ['diff', /^(---|\+\+\+) \S/m, 2],
]

// The superset language takes its subset's score once it has evidence of its own.
const SUPERSETS: [superset: string, subset: string][] = [
  ['typescript', 'javascript'],
  ['cpp', 'c'],
]

/** Text looked at: detection on a huge block only needs its start. */
const MAX_CHARS = 5000
/** Minimum score for a guess, and the lead it needs over the runner-up. */
const MIN_SCORE = 2
const MIN_LEAD = 1

function looksLikeJson(text: string): boolean {
  if (!/^[[{]/.test(text)) return false
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null
  } catch {
    return false
  }
}

// YAML has no keywords, only shape: every line is `key: value`, `key:`, `- item`
// or a comment, with at least two keys and one of them nested or listing.
function looksLikeYaml(lines: string[]): boolean {
  if (lines.length < 2) return false
  let keys = 0
  let nested = false
  for (const line of lines) {
    if (/^\s*#/.test(line) || /^---\s*$/.test(line)) continue
    if (/^\s*(-\s+)?[\w.-]+:(\s+\S.*)?$/.test(line)) {
      keys++
      if (/^\s+/.test(line) || /^\s*-\s/.test(line)) nested = true
      continue
    }
    if (/^\s*-\s+\S/.test(line)) {
      nested = true
      continue
    }
    return false
  }
  return keys >= 2 && nested
}

/**
 * Guesses the language of a code block's text. Returns a lowlight id, or `null`
 * when it isn't clearly code (prose, lists, logs, too short, ambiguous).
 */
export function detectCodeLanguage(code: string): string | null {
  const text = code.slice(0, MAX_CHARS).trim()
  if (text.length < 3) return null
  if (looksLikeJson(text)) return 'json'
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (looksLikeYaml(lines)) return 'yaml'

  const scores = new Map<string, number>()
  for (const [lang, pattern, weight] of RULES) {
    if (typeof pattern === 'function' ? pattern(text) : pattern.test(text)) scores.set(lang, (scores.get(lang) ?? 0) + weight)
  }
  for (const [superset, subset] of SUPERSETS) {
    const own = scores.get(superset)
    const inherited = scores.get(subset)
    if (own && inherited) {
      scores.set(superset, own + inherited)
      scores.delete(subset)
    }
  }

  let best: string | null = null
  let bestScore = 0
  let runnerUp = 0
  for (const [lang, score] of scores) {
    if (score > bestScore) {
      runnerUp = bestScore
      best = lang
      bestScore = score
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }
  if (!best || bestScore < MIN_SCORE || bestScore - runnerUp < MIN_LEAD) return null
  return best
}

// Small memo: the highlighter and the block's language chip ask for the same
// text on every render/transaction.
const cache = new Map<string, string | null>()
const CACHE_SIZE = 64

/** `detectCodeLanguage` with a small cache keyed by the text. */
export function detectCodeLanguageCached(code: string): string | null {
  const hit = cache.get(code)
  if (hit !== undefined) return hit
  const result = detectCodeLanguage(code)
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  cache.set(code, result)
  return result
}

/** The slice of the lowlight API that the TipTap code block plugin uses. */
interface LowlightLike {
  highlight: (language: string, value: string) => unknown
  highlightAuto: (value: string) => unknown
  listLanguages: () => string[]
  registered?: (language: string) => boolean
}

/**
 * Wraps a lowlight instance so blocks without a language are highlighted with
 * `detectCodeLanguage` instead of lowlight's noisy `highlightAuto` — and left
 * unhighlighted (as plain text) when no language is detected. The TipTap plugin
 * calls `highlightAuto` exactly for those blocks; nothing is written to the note.
 */
export function withLanguageDetection<T extends LowlightLike>(lowlight: T): T {
  return {
    ...lowlight,
    highlightAuto: (value: string) => {
      const language = detectCodeLanguageCached(value)
      return lowlight.highlight(language && lowlight.registered?.(language) !== false ? language : 'plaintext', value)
    },
  }
}
