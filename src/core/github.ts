import { randomBytes } from "node:crypto";
import { CcxError } from "../utils/errors.js";

/** All auto-generated sync repos use this prefix so pull can discover them by name. */
export const CCX_REPO_PREFIX = "ccx-sync-";

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

export async function listOwnerRepos(token: string): Promise<GitHubRepoResponse[]> {
  const repos: GitHubRepoResponse[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}`;
    const batch = await githubFetch<GitHubRepoResponse[]>(url, token);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

export async function listCcxRepos(token: string): Promise<GitHubRepoResponse[]> {
  const repos = await listOwnerRepos(token);
  return repos.filter((repo) => repo.name.startsWith(CCX_REPO_PREFIX));
}

export async function generateUniqueCcxRepoName(token: string): Promise<string> {
  const taken = new Set((await listOwnerRepos(token)).map((repo) => repo.name.toLowerCase()));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${CCX_REPO_PREFIX}${randomBytes(3).toString("hex")}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new CcxError("Could not generate a unique repository name.");
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
      description: "Encrypted ccx preset sync repository"
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
