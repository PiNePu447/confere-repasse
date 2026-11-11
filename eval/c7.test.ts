import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('C7 isolation', () => {
  it('fails the build if agent/rules/functions reference eval/', () => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', resolve(root, 'eval/check-c7.ts')],
      { encoding: 'utf8', cwd: root },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /C7 isolation check OK/)
  })
})
