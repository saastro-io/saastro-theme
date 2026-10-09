/**
 * Puente `postMessage` de la vista previa de borrador (`/p/<slug>?__pv=…`).
 *
 * El Hub encuadra la página y le manda, desde SU origen y solo desde él:
 *   { type: 'insert' | 'remove' | 'move' | 'swap', id, html?, index? }
 * `html` es el fragmento de `POST /__render`. Se inserta con
 * `createContextualFragment` —no con `innerHTML`— porque así los `<script>` del
 * fragmento SÍ se ejecutan, que es lo que hidrata las islas (el formulario).
 * Tras pintar, en el siguiente frame, contesta `{ type: 'swapped', id }`.
 *
 * Se inyecta como texto (`installPreviewBridge.toString()`), así que la función
 * tiene que ser AUTOCONTENIDA: nada de imports ni de variables de fuera.
 */
export interface BridgeMessage {
  type: 'insert' | 'remove' | 'move' | 'swap';
  id: string;
  html?: string;
  index?: number;
}

export function installPreviewBridge(hubOrigin: string): void {
  const SEL = '[data-saastro-blocks]';
  const rootEl = () => document.querySelector(SEL);
  const blockEls = (root: Element) =>
    Array.from(root.children).filter((c) => (c.getAttribute('data-saastro') || '').indexOf('sec:') === 0);
  const find = (root: Element, id: string) =>
    blockEls(root).find((c) => c.getAttribute('data-saastro') === 'sec:' + id) || null;
  const frag = (html: string) => document.createRange().createContextualFragment(html);

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== hubOrigin) return;
    const m = e.data as BridgeMessage | null;
    if (!m || typeof m !== 'object' || typeof m.id !== 'string') return;
    const root = rootEl();
    if (!root) return;
    const el = find(root, m.id);
    const before = (i: unknown) => (typeof i === 'number' ? blockEls(root)[i] || null : null);

    if (m.type === 'swap' && typeof m.html === 'string') {
      if (el) el.replaceWith(frag(m.html));
      else root.appendChild(frag(m.html));
    } else if (m.type === 'insert' && typeof m.html === 'string') {
      if (el) el.remove();
      root.insertBefore(frag(m.html), before(m.index));
    } else if (m.type === 'remove') {
      if (el) el.remove();
    } else if (m.type === 'move') {
      if (!el) return;
      el.remove();
      root.insertBefore(el, before(m.index));
    } else {
      return;
    }
    const source = e.source as Window | null;
    requestAnimationFrame(() => {
      if (source) source.postMessage({ type: 'swapped', id: m.id }, hubOrigin);
    });
  });
}

/** El `<script>` inline que instala el puente para un origen concreto. */
export function previewBridgeScript(hubOrigin: string): string {
  return `(${installPreviewBridge.toString()})(${JSON.stringify(hubOrigin).replace(/</g, '\\u003c')});`;
}
