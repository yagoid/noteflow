// Guard for tests that empty, delete or write into a notes dir (or any path
// that production code derives from the user's home): the path must hang from
// the test's own temp dir. Call it BEFORE the first rmSync / write — a mock of
// os.homedir() or of HOME / USERPROFILE that silently stops applying (an import
// or interop change) must fail the test, not reach ~/noteflow-notes.
import os from 'node:os'
import path from 'node:path'

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

/**
 * → `target`, or throws unless `target` is strictly inside `testTmp` AND
 * `testTmp` is strictly inside the OS temp dir (an unset `tmp` variable, or one
 * pointing at a real folder, is refused too).
 */
export function assertInsideTmp(target: string, testTmp: string): string {
  if (!target || !testTmp || !isInside(testTmp, os.tmpdir()) || !isInside(target, testTmp)) {
    throw new Error(`Refusing to touch "${target}": it is not inside this test's temp dir ("${testTmp}")`)
  }
  return target
}
