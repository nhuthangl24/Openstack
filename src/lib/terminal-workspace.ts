export interface SessionSnapshot {
  username: string;
  password: string;
}

export interface TerminalWorkspacePayload {
  vmId?: string;
  vmName?: string;
  host?: string;
  username?: string;
  initialCommand?: string;
  createdAt: number;
}

export const TERMINAL_WORKSPACE_KEY = "orbitstack:terminal-workspace";
export const TERMINAL_WORKSPACE_EVENT = "orbitstack:terminal-workspace-updated";

function emitWorkspaceEvent() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(TERMINAL_WORKSPACE_EVENT));
}

export function getSshSessionKey(target: string) {
  return `orbitstack:ssh-session:${target}`;
}

export function getDefaultSshSession() {
  return {
    username: "ubuntu",
    password: "",
  } satisfies SessionSnapshot;
}

export function readStoredSshSession(target: string) {
  if (typeof window === "undefined" || !target) {
    return getDefaultSshSession();
  }

  const raw = sessionStorage.getItem(getSshSessionKey(target));

  if (!raw) {
    return getDefaultSshSession();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;

    return {
      username: parsed.username || "ubuntu",
      password: parsed.password || "",
    } satisfies SessionSnapshot;
  } catch {
    return getDefaultSshSession();
  }
}

export function persistStoredSshSession(
  target: string,
  session: SessionSnapshot,
) {
  if (typeof window === "undefined" || !target) {
    return;
  }

  sessionStorage.setItem(getSshSessionKey(target), JSON.stringify(session));
}

export function clearStoredSshSession(target: string) {
  if (typeof window === "undefined" || !target) {
    return;
  }

  sessionStorage.removeItem(getSshSessionKey(target));
}

export function writeTerminalWorkspace(
  payload: Omit<TerminalWorkspacePayload, "createdAt">,
) {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(
    TERMINAL_WORKSPACE_KEY,
    JSON.stringify({
      ...payload,
      createdAt: Date.now(),
    } satisfies TerminalWorkspacePayload),
  );

  emitWorkspaceEvent();
}

export function readTerminalWorkspace() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(TERMINAL_WORKSPACE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TerminalWorkspacePayload>;

    return {
      vmId: parsed.vmId,
      vmName: parsed.vmName,
      host: parsed.host,
      username: parsed.username,
      initialCommand: parsed.initialCommand,
      createdAt: parsed.createdAt || Date.now(),
    } satisfies TerminalWorkspacePayload;
  } catch {
    return null;
  }
}

export function clearTerminalWorkspace() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.removeItem(TERMINAL_WORKSPACE_KEY);
  emitWorkspaceEvent();
}

export function getDefaultWsUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const host = window.location.hostname;
  const secure = window.location.protocol === "https:";

  return `${secure ? "wss" : "ws"}://${host}:3001`;
}

export function normalizeSshWsUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    if (!url.pathname || url.pathname === "") {
      url.pathname = "/";
    } else if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }

    return url.toString();
  } catch {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
}

export function resolveSshWsUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  return normalizeSshWsUrl(
    process.env.NEXT_PUBLIC_SSH_WS_URL || getDefaultWsUrl(),
  );
}
