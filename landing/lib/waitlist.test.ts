import { describe, it, expect, vi } from "vitest";
import { isValidEmail, submitWaitlist, type WaitlistRpcClient } from "./waitlist";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  user.name+tag@example.com  ")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "nope", "a@b", "a b@c.com", "@x.com", "x@.com", "x@y."]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });

  it("rejects over-long addresses", () => {
    expect(isValidEmail("a".repeat(250) + "@example.com")).toBe(false);
  });
});

describe("submitWaitlist", () => {
  const okClient = (): WaitlistRpcClient => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
  });

  it("blocks when the honeypot is filled, without calling the RPC", async () => {
    const client = okClient();
    const res = await submitWaitlist("real@example.com", "i-am-a-bot", client);
    expect(res).toEqual({ ok: true });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before calling the RPC", async () => {
    const client = okClient();
    const res = await submitWaitlist("nope", "", client);
    expect(res).toEqual({ ok: false, reason: "invalid_email" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("calls join_waitlist with the trimmed email on a valid submit", async () => {
    const client = okClient();
    const res = await submitWaitlist("  new@example.com ", "", client);
    expect(res).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("join_waitlist", {
      p_email: "new@example.com",
    });
  });

  it("surfaces a backend error as reason=error", async () => {
    const client: WaitlistRpcClient = {
      rpc: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
    };
    const res = await submitWaitlist("new@example.com", "", client);
    expect(res).toEqual({ ok: false, reason: "error" });
  });
});
