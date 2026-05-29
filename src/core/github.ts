import { CcxError } from "../utils/errors.js";
import {
  CCX_REPO_MARKER,
  generateUniqueCcxRepoName,
  isCcxSyncRepo
} from "./github-repo.js";

export { CCX_REPO_MARKER, CCX_REPO_NAME_PREFIX, formatGeneratedRepoName, isCcxSyncRepo } from "./github-repo.js";

export interface GitHubTarget {
  repo: string;
  token: string;
  branch?: string;
  filePath: string;
}

export interface EnsureRepositoryOptions {
  createIfMissing?: boolean;
  privateRepo?: boolean;
}

interface GitHubContentResponse {
  sha?: string;
  content?: string;
  encoding?: string;
}

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  private: boolean;
  description?: string | null;
  default_branch?: string;
}

interface GitHubUserResponse {
  login: string;
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new CcxError(`Invalid GitHub repo: ${repo}`, "Use owner/name.");
  return { owner, name };
}

function encodePath(filePath: string): string {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

async function githubFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    }
  });
  if (response.status === 404) throw new CcxError("GitHub resource not found.");
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CcxError(`GitHub API failed: ${response.status} ${response.statusText}`, text.slice(0, 500));
  }
  return (await response.json()) as T;
}

export async function getAuthenticatedLogin(token: string): Promise<string> {
  const data = await githubFetch<GitHubUserResponse>("https://api.github.com/user", token);
  return data.login;
}

interface GitHubSearchResponse {
  items: GitHubRepoResponse[];
}

export async function listAccessibleRepos(token: string): Promise<GitHubRepoResponse[]> {
  const byFullName = new Map<string, GitHubRepoResponse>();
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      affiliation: "owner,collaborator,organization_member",
      visibility: "all",
      per_page: "100",
      page: String(page),
      sort: "updated",
      direction: "desc"
    });
    const batch = await githubFetch<GitHubRepoResponse[]>(
      `https://api.github.com/user/repos?${params}`,
      token
    );
    for (const repo of batch) byFullName.set(repo.full_name.toLowerCase(), repo);
    if (batch.length < 100) break;
  }
  return [...byFullName.values()];
}

async function searchCcxSyncRepos(token: string, login: string): Promise<GitHubRepoResponse[]> {
  const q = `user:${login} "${CCX_REPO_MARKER}" in:description`;
  const data = await githubFetch<GitHubSearchResponse>(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=100`,
    token
  );
  return data.items.filter(isCcxSyncRepo);
}

export async function listCcxRepos(token: string): Promise<GitHubRepoResponse[]> {
  const login = await getAuthenticatedLogin(token);
  const byFullName = new Map<string, GitHubRepoResponse>();

  for (const repo of await listAccessibleRepos(token)) {
    if (isCcxSyncRepo(repo)) {
      byFullName.set(repo.full_name.toLowerCase(), repo);
    }
  }

  if (byFullName.size === 0) {
    try {
      for (const repo of await searchCcxSyncRepos(token, login)) {
        byFullName.set(repo.full_name.toLowerCase(), repo);
      }
    } catch {
      // Search may be unavailable for some token types.
    }
  }

  return [...byFullName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateUniqueCcxRepoNameForToken(token: string): Promise<string> {
  const login = await getAuthenticatedLogin(token);
  const taken = new Set((await listAccessibleRepos(token)).map((repo) => repo.name.toLowerCase()));
  return generateUniqueCcxRepoName(login, taken);
}

export async function getRepository(target: GitHubTarget): Promise<GitHubRepoResponse | undefined> {
  const { owner, name } = parseRepo(target.repo);
  const url = `https://api.github.com/repos/${owner}/${name}`;
  try {
    return await githubFetch<GitHubRepoResponse>(url, target.token);
  } catch (error) {
    if (error instanceof CcxError && error.message.includes("not found")) return undefined;
    throw error;
  }
}

export async function createRepository(target: GitHubTarget, privateRepo = true): Promise<GitHubRepoResponse> {
  const { owner, name } = parseRepo(target.repo);
  const login = await getAuthenticatedLogin(target.token);
  const url = owner.toLowerCase() === login.toLowerCase()
    ? "https://api.github.com/user/repos"
    : `https://api.github.com/orgs/${encodeURIComponent(owner)}/repos`;
  return await githubFetch<GitHubRepoResponse>(url, target.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      private: privateRepo,
      auto_init: true,
      description: CCX_REPO_MARKER
    })
  });
}

export async function ensureRepository(target: GitHubTarget, options: EnsureRepositoryOptions = {}): Promise<GitHubRepoResponse> {
  const existing = await getRepository(target);
  if (existing) return existing;
  if (!options.createIfMissing) {
    throw new CcxError(
      `GitHub repository ${target.repo} does not exist or is not accessible.`,
      "Create it first, or run push with --create-repo. New repositories are private by default unless --public-repo is used."
    );
  }
  return await createRepository(target, options.privateRepo ?? true);
}

async function getExistingSha(target: GitHubTarget): Promise<string | undefined> {
  const { owner, name } = parseRepo(target.repo);
  const params = new URLSearchParams();
  if (target.branch) params.set("ref", target.branch);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${encodePath(target.filePath)}${suffix}`;
  try {
    const data = await githubFetch<GitHubContentResponse>(url, target.token);
    return data.sha;
  } catch (error) {
    if (error instanceof CcxError && error.message.includes("not found")) return undefined;
    throw error;
  }
}

export async function uploadEncryptedProfiles(target: GitHubTarget, content: Buffer): Promise<void> {
  const { owner, name } = parseRepo(target.repo);
  const sha = await getExistingSha(target);
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${encodePath(target.filePath)}`;
  const body: Record<string, unknown> = {
    message: `ccx sync ${new Date().toISOString()}`,
    content: content.toString("base64")
  };
  if (sha) body.sha = sha;
  if (target.branch) body.branch = target.branch;
  await githubFetch(url, target.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function downloadEncryptedProfiles(target: GitHubTarget): Promise<Buffer> {
  const { owner, name } = parseRepo(target.repo);
  const params = new URLSearchParams();
  if (target.branch) params.set("ref", target.branch);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${encodePath(target.filePath)}${suffix}`;
  const data = await githubFetch<GitHubContentResponse>(url, target.token);
  if (data.encoding !== "base64" || !data.content) throw new CcxError("Unexpected GitHub content response.");
  return Buffer.from(data.content.replace(/\n/g, ""), "base64");
}
