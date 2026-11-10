import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// El control de cobertura de «página en construcción»: si alguien devuelve `main`
// al entrypoint del adaptador o quita run_worker_first, las páginas prerenderizadas
// vuelven a verse en obras sin que ningún otro test lo note.
const cfg = readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '');

describe('wrangler.jsonc: la puerta de obras llega a lo prerenderizado', () => {
  it('main es el Worker de entrada', () => {
    expect(cfg).toMatch(/"main":\s*"src\/worker\.ts"/);
  });
  it('run_worker_first activo y /_astro/ excluido (sin excluir rutas con punto)', () => {
    expect(cfg).toMatch(/"run_worker_first":\s*\[[^\]]*"\/\*"[^\]]*"!\/_astro\/\*"/);
  });
  it('el Worker llama a la puerta antes de delegar', () => {
    const w = readFileSync('src/worker.ts', 'utf8');
    expect(w.indexOf('gateMaintenance(request)')).toBeGreaterThan(-1);
    expect(w.indexOf('gateMaintenance(request)')).toBeLessThan(w.indexOf('handle(request'));
  });
});
