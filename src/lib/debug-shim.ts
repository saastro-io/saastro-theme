/**
 * Shim for the `debug` package in Cloudflare Workers/miniflare.
 * The real `debug` uses `module.exports` (CJS) which breaks in workerd.
 */
const noop = () => noop;
noop.enabled = false;
noop.destroy = noop;
noop.extend = () => noop;
export default () => noop;
