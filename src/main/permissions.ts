// Web permissions Vault never asks for and never grants.
//
// Electron's security checklist asks an app to decide its permission policy
// rather than inherit Chromium's defaults, and Chromium's default is to allow
// several things this vault has no use for: geolocation, camera, microphone,
// notifications, clipboard *reads*, external protocols. A sandboxed renderer with
// no network stack has no reason to hold any of them, so the policy is one answer
// for every request. It also closes the door behind the clipboard fix: the copy
// path lives in the main process, so a renderer that tried to write the system
// clipboard directly would be reaching for a permission this app does not grant.
//
// The two hooks are taken as a narrow port, in the shape `ClipboardPort` uses:
// the policy is decided here and `index.ts` adapts the Electron session to it, so
// the rule can be tested without a running app.
export interface PermissionGuardTarget {
  setPermissionCheckHandler(handler: (permission: string) => boolean): void;
  setPermissionRequestHandler(
    handler: (permission: string, respond: (granted: boolean) => void) => void,
  ): void;
}

export function denyAllPermissions(target: PermissionGuardTarget): void {
  // The synchronous check answers before a feature is even probed, and the
  // asynchronous request answers the calls that got past it. Both say no, and
  // neither looks at who asked or for what: there is no permission this app
  // grants, so there is no argument worth branching on.
  target.setPermissionCheckHandler(() => false);
  target.setPermissionRequestHandler((_permission, respond) => {
    respond(false);
  });
}
