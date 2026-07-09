import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { RoamActionClient, RoamResponse } from "../src/types.js";
import { uploadFile } from "../src/operations/files.js";

// Captures the args passed to `file.upload` so tests can assert on the
// mimetype/filename the operation derived before handing off to the transport.
interface UploadCall {
  base64: string;
  mimetype: string;
  filename?: string;
}

function mockClient(): { client: RoamActionClient; calls: UploadCall[] } {
  const calls: UploadCall[] = [];
  const client: RoamActionClient = {
    async call<T = unknown>(action: string, args: unknown[] = []): Promise<RoamResponse<T>> {
      if (action === "file.upload") {
        calls.push((args[0] as UploadCall) ?? ({} as UploadCall));
        return { success: true, result: "https://example.com/uploaded" as unknown as T };
      }
      throw new Error(`unexpected action: ${action}`);
    },
  };
  return { client, calls };
}

describe("uploadFile MIME handling", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "roam-files-test-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("uploads a local .html file as text/html (regression: issue #21)", async () => {
    const filePath = join(dir, "article.html");
    await writeFile(filePath, "<!doctype html><html><body>hi</body></html>");

    const { client, calls } = mockClient();
    const result = await uploadFile(client, { filePath });

    expect(result.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0].mimetype).toBe("text/html");
    expect(calls[0].filename).toBe("article.html");
  });

  it("falls back to application/octet-stream for an unknown local extension", async () => {
    const filePath = join(dir, "backup.unknownext");
    await writeFile(filePath, "just some bytes with no magic signature");

    const { client, calls } = mockClient();
    await uploadFile(client, { filePath });

    expect(calls[0].mimetype).toBe("application/octet-stream");
  });

  it("still detects a known image extension", async () => {
    const filePath = join(dir, "pic.png");
    await writeFile(filePath, "not really a png but the extension wins");

    const { client, calls } = mockClient();
    await uploadFile(client, { filePath });

    expect(calls[0].mimetype).toBe("image/png");
  });

  it("honors an explicit mimetype override over extension detection", async () => {
    const filePath = join(dir, "data.html");
    await writeFile(filePath, "<html></html>");

    const { client, calls } = mockClient();
    await uploadFile(client, { filePath, mimetype: "application/xhtml+xml" });

    expect(calls[0].mimetype).toBe("application/xhtml+xml");
  });

  it("uses the filename extension for base64 uploads when magic bytes miss", async () => {
    const { client, calls } = mockClient();
    await uploadFile(client, {
      base64: Buffer.from("<html></html>").toString("base64"),
      filename: "page.html",
    });

    expect(calls[0].mimetype).toBe("text/html");
    expect(calls[0].filename).toBe("page.html");
  });

  it("detects image magic bytes for base64 even with a misleading filename", async () => {
    const { client, calls } = mockClient();
    // "iVBOR..." is the base64 magic-byte prefix for PNG.
    await uploadFile(client, {
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      filename: "totally.txt",
    });

    expect(calls[0].mimetype).toBe("image/png");
  });
});
