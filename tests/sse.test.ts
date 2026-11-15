import { describe, expect, it } from "vitest";
import { createSseParser, encodeEvent } from "@/lib/sse";

describe("SSE encode/parse", () => {
  it("round-trips events", () => {
    const parse = createSseParser();
    const wire = encodeEvent({ type: "token", text: "Hello" }) + encodeEvent({ type: "status", text: "Searching" });
    expect(parse(wire)).toEqual([
      { type: "token", text: "Hello" },
      { type: "status", text: "Searching" },
    ]);
  });

  it("handles an event split across network chunks", () => {
    const parse = createSseParser();
    const wire = encodeEvent({ type: "token", text: "split me" });
    const mid = Math.floor(wire.length / 2);
    expect(parse(wire.slice(0, mid))).toEqual([]);
    expect(parse(wire.slice(mid))).toEqual([{ type: "token", text: "split me" }]);
  });

  it("keeps newlines inside token text", () => {
    const parse = createSseParser();
    expect(parse(encodeEvent({ type: "token", text: "line1\n\nline2" }))).toEqual([
      { type: "token", text: "line1\n\nline2" },
    ]);
  });

  it("skips malformed data", () => {
    const parse = createSseParser();
    expect(parse("data: {not json}\n\n")).toEqual([]);
  });
});
