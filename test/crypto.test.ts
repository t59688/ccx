import { describe, expect, it } from "vitest";
import { decryptBuffer, encryptBuffer } from "../src/core/crypto.js";

describe("crypto", () => {
  it("roundtrips encrypted buffers", () => {
    const encrypted = encryptBuffer(Buffer.from("hello"), "pass");
    expect(decryptBuffer(encrypted, "pass").toString()).toBe("hello");
  });
});
