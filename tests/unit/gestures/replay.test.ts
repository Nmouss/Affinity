import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectLeap, type LeapStatus } from "@/lib/gestures/leap";
import type { HandFrame, LeapServiceInfo } from "@/lib/gestures/types";

const replayScript = fileURLToPath(new URL("../../../scripts/leap/replay.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("../../../scripts/leap/fixtures/synthetic-session.jsonl", import.meta.url));

let server: ChildProcess;
let url: string;

beforeAll(async () => {
  server = spawn(process.execPath, [replayScript, "--port", "0", "--file", fixture], { stdio: ["ignore", "pipe", "pipe"] });
  url = await new Promise<string>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`replay did not start: ${output}`)), 5000);
    server.stdout?.on("data", (chunk) => {
      output += String(chunk);
      const match = /listening on (ws:\/\/\S+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    server.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    server.on("exit", (code) => reject(new Error(`replay exited (${code}): ${output}`)));
  });
});

afterAll(() => {
  server?.kill();
});

describe("replay server", () => {
  it("streams frames to connectLeap once it sends the control messages", async () => {
    const frames: HandFrame[] = [];
    const statuses: LeapStatus[] = [];
    let service: LeapServiceInfo | null = null;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        stop();
        reject(new Error(`only ${frames.length} frames arrived`));
      }, 5000);
      const stop = connectLeap(
        (frame) => {
          frames.push(frame);
          if (frames.length >= 10) {
            clearTimeout(timeout);
            stop();
            resolve();
          }
        },
        (status) => statuses.push(status),
        { url, onService: (info) => (service = info) },
      );
    });

    expect(frames.length).toBeGreaterThanOrEqual(10);
    expect(statuses.slice(0, 2)).toEqual(["connecting", "open"]);
    expect(service).toMatchObject({ version: 6, replay: true });
    // Microseconds became milliseconds, and frames keep their order.
    expect(frames[1].timestamp - frames[0].timestamp).toBeCloseTo(1000 / 60, 0);
  });

  it("rejects any path but /v6.json", async () => {
    const wrong = url.replace("/v6.json", "/");
    const outcome = await new Promise<string>((resolve) => {
      const socket = new WebSocket(wrong);
      socket.addEventListener("open", () => resolve("open"));
      socket.addEventListener("error", () => resolve("error"));
    });
    expect(outcome).toBe("error");
  });
});
