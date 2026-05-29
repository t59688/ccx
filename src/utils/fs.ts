import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import TOML from "@iarna/toml";

export async function pathExists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath);
}

export async function ensurePrivateDir(dir: string): Promise<void> {
  await fs.ensureDir(dir);
  if (process.platform !== "win32") {
    await fs.chmod(dir, 0o700).catch(() => undefined);
  }
}

export async function writePrivateFile(filePath: string, content: string | Buffer): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  if (process.platform !== "win32") {
    await fs.chmod(filePath, 0o600).catch(() => undefined);
  }
}

export async function readJsonFile<T = Record<string, unknown>>(filePath: string): Promise<T | undefined> {
  if (!(await fs.pathExists(filePath))) return undefined;
  return fs.readJson(filePath) as Promise<T>;
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writePrivateFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function readYamlFile<T = unknown>(filePath: string): Promise<T | undefined> {
  if (!(await fs.pathExists(filePath))) return undefined;
  const text = await fs.readFile(filePath, "utf8");
  return YAML.parse(text) as T;
}

export async function writeYamlFile(filePath: string, data: unknown): Promise<void> {
  await writePrivateFile(filePath, YAML.stringify(data));
}

export async function readTomlFile(filePath: string): Promise<Record<string, unknown> | undefined> {
  if (!(await fs.pathExists(filePath))) return undefined;
  const text = await fs.readFile(filePath, "utf8");
  return TOML.parse(text) as Record<string, unknown>;
}

function ensureExplicitModelProvidersTable(toml: string): string {
  if (!toml.includes("[model_providers.")) return toml;
  if (/^\[model_providers\]$/m.test(toml)) return toml;
  return toml.replace(/^\[model_providers\./m, "[model_providers]\n$&");
}

export async function writeTomlFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  const toml = ensureExplicitModelProvidersTable(TOML.stringify(data as never));
  await writePrivateFile(filePath, toml);
}

export async function copyIfExists(source: string, target: string): Promise<boolean> {
  if (!(await fs.pathExists(source))) return false;
  await fs.ensureDir(path.dirname(target));
  await fs.copy(source, target, { overwrite: true, errorOnExist: false });
  return true;
}

export async function listFilesRecursive(dir: string): Promise<string[]> {
  if (!(await fs.pathExists(dir))) return [];
  const out: string[] = [];
  async function walk(current: string) {
    const items = await fs.readdir(current, { withFileTypes: true });
    for (const item of items) {
      const itemPath = path.join(current, item.name);
      if (item.isDirectory()) await walk(itemPath);
      else if (item.isFile()) out.push(itemPath);
    }
  }
  await walk(dir);
  return out;
}
