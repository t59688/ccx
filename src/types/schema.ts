import { z } from "zod";

export const AgentSchema = z.enum(["claude", "codex"]);
export type Agent = z.infer<typeof AgentSchema>;

export const JsonRecordSchema = z.record(z.string(), z.unknown());
export type JsonRecord = z.infer<typeof JsonRecordSchema>;

export const ClaudeProfileSchema = z.object({
  settings: JsonRecordSchema.optional(),
  config: JsonRecordSchema.optional()
});
export type ClaudeProfile = z.infer<typeof ClaudeProfileSchema>;

export const CodexProfileSchema = z.object({
  config: JsonRecordSchema.optional(),
  auth: JsonRecordSchema.optional()
});
export type CodexProfile = z.infer<typeof CodexProfileSchema>;


export const AgentProfileMetaSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string().optional(),
  agent: AgentSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type AgentProfileMeta = z.infer<typeof AgentProfileMetaSchema>;

export const StateSchema = z.object({
  schema: z.string().default("ccx.state.v1"),
  language: z.enum(["en", "zh-CN"]).default("zh-CN"),
  activeClaudeProfile: z.string().optional(),
  activeCodexProfile: z.string().optional(),
  githubRepo: z.string().optional(),
  githubToken: z.string().optional(),
  githubBranch: z.string().optional(),
  githubPath: z.string().optional(),
  encryptionKeyHash: z.string().optional()
});
export type State = z.infer<typeof StateSchema>;

export const FullSnapshotSchema = z.object({
  claude: ClaudeProfileSchema.optional(),
  codex: CodexProfileSchema.optional()
});
export type FullSnapshot = z.infer<typeof FullSnapshotSchema>;

export const ArchiveEntrySchema = z.object({
  path: z.string(),
  mode: z.number().optional(),
  content: z.string()
});

export const ArchiveSchema = z.object({
  schema: z.literal("ccx.archive.v1"),
  createdAt: z.string(),
  entries: z.array(ArchiveEntrySchema)
});
export type Archive = z.infer<typeof ArchiveSchema>;

export const EncryptedEnvelopeSchema = z.object({
  schema: z.literal("ccx.encrypted.v1"),
  kdf: z.object({
    name: z.literal("scrypt"),
    salt: z.string(),
    N: z.number(),
    r: z.number(),
    p: z.number(),
    keyBytes: z.number()
  }),
  cipher: z.object({
    name: z.literal("aes-256-gcm"),
    iv: z.string(),
    tag: z.string()
  }),
  ciphertext: z.string()
});
export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;
