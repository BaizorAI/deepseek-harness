/**
 * Baizor AI login button, node half. Pure UI plugin: the empty apply exists
 * so the plugin appears in the host Loader; the browser half ships via
 * exports["./client"], discovered through the package.json dshClient
 * declaration. The login itself runs in the baizorAuth host Remote.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
