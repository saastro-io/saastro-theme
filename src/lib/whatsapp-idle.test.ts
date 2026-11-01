/**
 * El widget de WhatsApp no es crítico: su propia cabecera (WhatsAppWidget.tsx) dice que
 * SiteLayout lo monta con `client:idle` para no competir con el LCP, y el código usaba
 * `client:load`. Este test fija que doc y código coinciden.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('WhatsAppWidget en SiteLayout', () => {
  const layout = readFileSync(new URL('../layouts/SiteLayout.astro', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../widgets/WhatsApp/WhatsAppWidget.tsx', import.meta.url), 'utf8');
  it('se hidrata en idle, no en load', () => {
    expect(layout).toMatch(/<WhatsAppWidget [^>]*client:idle/);
    expect(layout).not.toMatch(/<WhatsAppWidget [^>]*client:load/);
  });
  it('la documentación del widget sigue diciendo idle', () => {
    expect(widget).toContain('`client:idle`');
  });
});
