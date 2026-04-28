let githubAccessToken: string | null = null;

export function setGitHubAccessToken(token: string) {
  githubAccessToken = token;
}

export function getGitHubAccessToken() {
  return githubAccessToken;
}

export function clearGitHubAccessToken() {
  githubAccessToken = null;
}
