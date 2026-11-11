/**
 * Bundle the Edge Function for deploy: single index.ts + deno.json under dist/agente/.
 * @supabase/supabase-js stays external (mapped in deno.json).
 */
import * as esbuild from 'esbuild'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'dist/agente')
const entry = resolve(root, 'supabase/functions/agente/index.ts')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [entry],
  bundle: true,
  outfile: resolve(outDir, 'index.ts'),
  format: 'esm',
  platform: 'neutral',
  target: 'esnext',
  legalComments: 'none',
  sourcemap: false,
  // Keep the Supabase SDK as a Deno npm: import (see deno.json).
  external: ['@supabase/supabase-js'],
  // Allow importing shared TS from ../../../src without Node resolution quirks.
  loader: { '.ts': 'ts' },
  logLevel: 'info',
})

const denoJson = {
  imports: {
    '@supabase/supabase-js': 'npm:@supabase/supabase-js@2.89.0',
  },
  compilerOptions: {
    lib: ['deno.window', 'deno.unstable'],
    strict: true,
  },
}

writeFileSync(resolve(outDir, 'deno.json'), JSON.stringify(denoJson, null, 2) + '\n')
console.log(`Wrote ${outDir}/index.ts and deno.json`)
