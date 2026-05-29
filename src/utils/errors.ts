export class CcxError extends Error {
  constructor(message: string, public readonly hint?: string) {
    super(message);
    this.name = "CcxError";
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
