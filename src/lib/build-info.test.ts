/**
 * build-info.ts: el sha que sirve /health.json. Pruebas del portero: solo un SHA-1 completo
 * vale (nada inventado), sin variable sale null, y el endpoint usa ESTA función.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildInfo } from './build-info';

const SHA = ['0123456789', 'abcdef0123', '456789abcd', 'ef01234567'].join('');

describe('buildInfo', () => {
  it('devuelve el sha y la rama que declara Workers Builds', () => {
    expect(buildInfo({ WORKERS_CI_COMMIT_SHA: SHA, WORKERS_CI_BRANCH: 'main' })).toEqual({ sha: SHA, branch: 'main' });
  });
  it('normaliza mayúsculas y espacios', () => {
    expect(buildInfo({ WORKERS_CI_COMMIT_SHA: ` ${SHA.toUpperCase()} ` }).sha).toBe(SHA);
  });
  it('sin variable no inventa un sha: null', () => {
    expect(buildInfo({})).toEqual({ sha: null, branch: null });
  });
  it('un valor que no es un SHA-1 completo se descarta', () => {
    expect(buildInfo({ WORKERS_CI_COMMIT_SHA: 'main' }).sha).toBeNull();
    expect(buildInfo({ WORKERS_CI_COMMIT_SHA: SHA.slice(0, 7) }).sha).toBeNull();
    expect(buildInfo({ WORKERS_CI_COMMIT_SHA: SHA + '0' }).sha).toBeNull();
  });
  it('el endpoint sale de esta función y es prerenderizado', () => {
    const ep = readFileSync(new URL('../pages/health.json.ts', import.meta.url), 'utf8');
    expect(ep).toContain("from '../lib/build-info'");
    expect(ep).toMatch(/prerender\s*=\s*true/);
  });
  it('astro.config.mjs inyecta el sha desde la variable de Workers Builds', () => {
    const cfg = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');
    expect(cfg).toMatch(/import\.meta\.env\.BUILD_SHA['"]:\s*JSON\.stringify\(process\.env\.WORKERS_CI_COMMIT_SHA/);
    expect(cfg).toMatch(/import\.meta\.env\.BUILD_BRANCH['"]:\s*JSON\.stringify\(process\.env\.WORKERS_CI_BRANCH/);
  });
});
