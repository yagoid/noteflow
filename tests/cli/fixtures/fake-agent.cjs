// A stand-in for an agent CLI (claude, codex…), launched by `noteflow run` in
// tests/cli/agentRun.test.ts. It never talks to anything: it records what it
// was given and, on request, drives the `noteflow task` protocol like an agent
// would. Everything is steered through the environment:
//   FAKE_AGENT_OUT      a directory: record.json (argv, cwd, the run's env, the
//                       prompt read from the file a one-line prompt points to)
//                       and the snapshots
//   FAKE_AGENT_CLI      path of cli/noteflow.js
//   FAKE_AGENT_DO       comma list — restart (run `task start <ids>` again, as
//                       the app's prompt says), storm (FAKE_AGENT_REPORTS
//                       `task report`s in a row, each checked on disk),
//                       finish-all, finish-first, subagents (like the
//                       subagents of a --parallel run: each id started ALONE
//                       with `task start <id>`, then each one finished —
//                       unless FAKE_AGENT_LEAVE_OPEN is set),
//                       snapshot (copy FAKE_AGENT_WATCH's files before and
//                       after the wait)
//   FAKE_AGENT_WATCH    a note folder (for snapshot)
//   FAKE_AGENT_WAIT_MS  how long it "works"
//   FAKE_AGENT_EXIT     its exit code
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const outDir = process.env.FAKE_AGENT_OUT
const cli = process.env.FAKE_AGENT_CLI
const todo = String(process.env.FAKE_AGENT_DO || '').split(',').filter(Boolean)
const ids = String(process.env.NOTEFLOW_RUN_TASKS || '').split(',').filter(Boolean)
const argv = process.argv.slice(2)

const noteflow = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf-8' })
const snapshot = (tag) => {
  const dir = process.env.FAKE_AGENT_WATCH
  for (const name of ['agent.md', 'note.md']) {
    try { fs.copyFileSync(path.join(dir, name), path.join(outDir, `${tag}-${name}`)) } catch { /* not there */ }
  }
}

const record = {
  argv, cwd: process.cwd(), runTasks: process.env.NOTEFLOW_RUN_TASKS || null, runAgent: process.env.NOTEFLOW_RUN_AGENT || null, runModel: process.env.NOTEFLOW_RUN_MODEL || null, runEffort: process.env.NOTEFLOW_RUN_EFFORT || null,
  promptFile: null, promptFromFile: null, calls: [],
  // What the desktop app sets to run the CLI with its Electron binary: it must not reach an agent.
  electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE || null,
}
// A one-line prompt that points to a file (what crosses a .cmd shim): read it like an agent would.
const pointer = /(\S*noteflow-run-\S*prompt\.md)/.exec(argv.join(' '))
if (pointer) {
  record.promptFile = pointer[1]
  try { record.promptFromFile = fs.readFileSync(pointer[1], 'utf-8') } catch (e) { record.promptFromFile = `unreadable: ${e.message}` }
}

if (todo.includes('snapshot')) snapshot('before')
const agentFile = () => {
  // Retried: on Windows a read can meet the instant another process renames a new version over the file.
  for (let attempt = 0; ; attempt++) {
    try { return fs.readFileSync(path.join(process.env.FAKE_AGENT_WATCH, 'agent.md'), 'utf-8') } catch (e) {
      if (attempt >= 50) return `unreadable: ${e.message}`
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}
if (todo.includes('restart')) {
  record.agentFileBeforeRestart = agentFile()
  const r = noteflow('task', 'start', ...ids)
  record.calls.push({ cmd: 'start', status: r.status, stdout: r.stdout, stderr: r.stderr })
  record.agentFileAfterRestart = agentFile()
}
if (todo.includes('storm')) {
  // Many reports in a row while the wrapper's heartbeat writes the same file:
  // after each one, the progress on disk must be the one just reported.
  const count = Number(process.env.FAKE_AGENT_REPORTS) || 20
  record.storm = { count, failed: [], clobbered: [] }
  for (let i = 0; i < count; i++) {
    const r = noteflow('task', 'report', ids[0], `step ${i}`)
    if (r.status !== 0) record.storm.failed.push({ i, stderr: r.stderr })
    if (!agentFile().split(/\r?\n/).includes(`progress: step ${i}`)) record.storm.clobbered.push(i)
  }
}
if (todo.includes('subagents')) {
  for (const id of ids) {
    const r = noteflow('task', 'start', id, '--on-finish', 'check')
    record.calls.push({ cmd: `start ${id}`, status: r.status, stdout: r.stdout, stderr: r.stderr })
  }
  record.agentFileAfterSubagentStarts = agentFile()
  for (const id of process.env.FAKE_AGENT_LEAVE_OPEN ? [] : ids) {
    const r = noteflow('task', 'finish', id, '--summary', `did ${id}`)
    record.calls.push({ cmd: `finish ${id}`, status: r.status, stdout: r.stdout, stderr: r.stderr })
  }
}
if (todo.includes('finish-first') || todo.includes('finish-all')) {
  let id = ids[0]
  while (id) {
    const r = noteflow('task', 'finish', id, '--summary', `did ${id}`)
    record.calls.push({ cmd: `finish ${id}`, status: r.status, stdout: r.stdout, stderr: r.stderr })
    const next = /Next: noteflow task start ([a-z0-9]{5})/.exec(r.stdout)
    id = todo.includes('finish-all') && next ? next[1] : null
    if (id) {
      const s = noteflow('task', 'start', id)
      record.calls.push({ cmd: `start ${id}`, status: s.status, stdout: s.stdout, stderr: s.stderr })
    }
  }
}
const wait = Number(process.env.FAKE_AGENT_WAIT_MS) || 0
if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
if (todo.includes('snapshot')) snapshot('after')

fs.writeFileSync(path.join(outDir, 'record.json'), JSON.stringify(record))
process.exitCode = Number(process.env.FAKE_AGENT_EXIT) || 0
