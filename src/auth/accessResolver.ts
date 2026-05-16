namespace WGU.Auth {
  export function defaultAccess(email = ""): WGU.Shared.UserAccess {
    return { email, role: "Viewer", canComment: false, canEditSource: false, canResolve: false, canManageSettings: false, active: false };
  }
  export function isEditor(access: WGU.Shared.UserAccess): boolean { return !!(access.active && access.canEditSource); }
  export function canComment(access: WGU.Shared.UserAccess): boolean { return !!(access.active && access.canComment); }
}
