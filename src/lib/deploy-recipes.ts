export interface DeployRecipe {
  key: "clone-only" | "node" | "python" | "docker";
  label: string;
  description: string;
  installCommand: string;
  postDeployCommand: string;
}

export interface ExternalRepoConfig {
  cloneUrl: string;
  label: string;
  directory: string;
}

export interface DeployCommandOptions {
  cloneUrl: string;
  repoDirectory: string;
  envFileName: string;
  envText: string;
  installCommand: string;
  postDeployCommand: string;
  branchName?: string;
}

export const deployRecipes: DeployRecipe[] = [
  {
    key: "clone-only",
    label: "Clone only",
    description: "Chỉ đồng bộ source code rồi để bạn thao tác tiếp trong terminal.",
    installCommand: "",
    postDeployCommand: "",
  },
  {
    key: "node",
    label: "Node service",
    description: "Phù hợp cho app Node.js hoặc frontend SSR/build bằng npm.",
    installCommand: "npm install",
    postDeployCommand: "npm run build",
  },
  {
    key: "python",
    label: "Python app",
    description: "Tạo virtualenv và cài package từ requirements.txt nếu có.",
    installCommand:
      "python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt",
    postDeployCommand: "",
  },
  {
    key: "docker",
    label: "Docker Compose",
    description: "Dành cho repo có docker compose và stack đã cài trên VM.",
    installCommand: "",
    postDeployCommand: "docker compose up -d --build",
  },
];

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function deriveRepoDirectory(input: string) {
  const cleaned = input
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    ?.replace(/\.git$/i, "");

  return sanitizeDirectoryName(cleaned || "app");
}

export function normalizeExternalRepoInput(raw: string): ExternalRepoConfig | null {
  const value = raw.trim();

  if (!value) {
    return null;
  }

  if (/^[\w.-]+\/[\w.-]+$/.test(value)) {
    return {
      cloneUrl: `https://github.com/${value}.git`,
      label: value,
      directory: deriveRepoDirectory(value),
    };
  }

  if (/^(https?:\/\/|git@)/i.test(value)) {
    return {
      cloneUrl: value,
      label: deriveRepoLabel(value),
      directory: deriveRepoDirectory(value),
    };
  }

  return null;
}

export function buildDeployCommand({
  cloneUrl,
  repoDirectory,
  envFileName,
  envText,
  installCommand,
  postDeployCommand,
  branchName,
}: DeployCommandOptions) {
  const workingDirectory = sanitizeDirectoryName(repoDirectory) || deriveRepoDirectory(cloneUrl);
  const branch = branchName?.trim();
  const normalizedEnvFile = envFileName.trim() || ".env";
  const normalizedEnvText = envText.trimEnd();
  const normalizedInstall = installCommand.trim();
  const normalizedPostDeploy = postDeployCommand.trim();

  const lines = [
    "set -e",
    "mkdir -p ~/orbitstack-apps",
    "cd ~/orbitstack-apps",
    `if [ -d ${shellQuote(workingDirectory)}/.git ]; then`,
    `  cd ${shellQuote(workingDirectory)}`,
    "  git pull --ff-only || git pull",
    "else",
    `  git clone ${shellQuote(cloneUrl)} ${shellQuote(workingDirectory)}`,
    `  cd ${shellQuote(workingDirectory)}`,
    "fi",
  ];

  if (branch) {
    lines.push(`git checkout ${shellQuote(branch)}`);
  }

  if (normalizedEnvText) {
    lines.push(
      `cat <<'EOF' > ${shellQuote(normalizedEnvFile)}`,
      normalizedEnvText,
      "EOF",
    );
  }

  if (normalizedInstall) {
    lines.push(normalizedInstall);
  }

  if (normalizedPostDeploy) {
    lines.push(normalizedPostDeploy);
  }

  return lines.join("\n");
}

function deriveRepoLabel(input: string) {
  const value = input.trim().replace(/\/+$/, "");

  if (value.startsWith("git@github.com:")) {
    return value
      .replace("git@github.com:", "")
      .replace(/\.git$/i, "");
  }

  try {
    const url = new URL(value);
    return url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "") || value;
  } catch {
    return value;
  }
}

function sanitizeDirectoryName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
