import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messages: new Set<(message: unknown) => void>(),
  sendMessage: vi.fn(
    async (): Promise<{ accepted: boolean; responses?: unknown[] }> => ({
      accepted: true,
    }),
  ),
}));
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      getURL: () => "safari-web-extension://test/",
      sendMessage: mocks.sendMessage,
      onMessage: {
        addListener: (listener: (message: unknown) => void) =>
          mocks.messages.add(listener),
        removeListener: (listener: (message: unknown) => void) =>
          mocks.messages.delete(listener),
      },
    },
  },
}));
import {
  connectTranslatePort,
  type TranslatePortMessage,
} from "../../src/shared/messages";

afterEach(() => {
  mocks.messages.clear();
  mocks.sendMessage.mockReset().mockResolvedValue({ accepted: true });
});
const request = (requestId: string): TranslatePortMessage => ({
  type: "translate",
  requestId,
  paragraphs: [{ id: "p1", text: "Hello" }],
  from: "en",
  to: "zh-CN",
});
const deliver = (message: unknown) => {
  for (const listener of mocks.messages) listener(message);
};

describe("Safari translation transport", () => {
  it("recovers dropped frame pushes from the runtime reply", async () => {
    const response = {
      type: "translateResult",
      requestId: "reply",
      results: [{ id: "p1", text: "你好" }],
      done: true,
    };
    mocks.sendMessage.mockResolvedValueOnce({
      accepted: true,
      responses: [response],
    });
    const channel = connectTranslatePort();
    const receive = vi.fn();
    channel.onMessage(receive);
    channel.postMessage(request("reply"));
    await vi.waitFor(() => expect(receive).toHaveBeenCalledWith(response));
    channel.disconnect();
  });
  it("deduplicates pushes and replies and tolerates an early terminal push", async () => {
    const response = {
      type: "translateResult",
      requestId: "mixed",
      results: [{ id: "p1", text: "你好" }],
      done: false,
    };
    const done = { ...response, results: [], done: true };
    mocks.sendMessage.mockResolvedValueOnce({
      accepted: true,
      responses: [response, done],
    });
    const channel = connectTranslatePort();
    const receive = vi.fn();
    channel.onMessage(receive);
    channel.postMessage(request("mixed"));
    deliver(done);
    deliver(response);
    await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(2));
    expect(receive.mock.calls.flatMap(([message]) => message.results)).toEqual(
      response.results,
    );
    expect(receive).toHaveBeenLastCalledWith(done);
    channel.disconnect();
  });
  it("wakes the event page for every request and routes only its own results", () => {
    const first = connectTranslatePort();
    const second = connectTranslatePort();
    const receive = vi.fn();
    const other = vi.fn();
    first.onMessage(receive);
    second.onMessage(other);
    first.postMessage(request("first"));
    const result = {
      type: "translateResult",
      requestId: "first",
      results: [{ id: "p1", text: "你好" }],
      done: true,
    };
    deliver(result);
    expect(receive).toHaveBeenCalledWith(result);
    expect(other).not.toHaveBeenCalled();
    first.postMessage(request("after-idle"));
    expect(mocks.sendMessage).toHaveBeenLastCalledWith(request("after-idle"));
    deliver({ ...result, requestId: "after-idle" });
    expect(receive).toHaveBeenCalledTimes(2);
    first.disconnect();
    second.disconnect();
    expect(mocks.messages.size).toBe(0);
  });
  it("surfaces a delivery failure instead of leaving loading indicators forever", async () => {
    mocks.sendMessage.mockRejectedValueOnce(
      new Error("Background unavailable"),
    );
    const channel = connectTranslatePort();
    const receive = vi.fn();
    channel.onMessage(receive);
    channel.postMessage(request("failure"));
    await vi.waitFor(() =>
      expect(receive).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "failure",
          done: true,
          results: [
            expect.objectContaining({
              error: expect.objectContaining({ code: "network" }),
            }),
          ],
        }),
      ),
    );
    channel.disconnect();
  });
  it("ignores results after cancellation", () => {
    const channel = connectTranslatePort();
    const receive = vi.fn();
    channel.onMessage(receive);
    channel.postMessage(request("cancelled"));
    channel.postMessage({ type: "cancel", requestId: "cancelled" });
    deliver({
      type: "translateResult",
      requestId: "cancelled",
      results: [],
      done: true,
    });
    expect(receive).not.toHaveBeenCalled();
    channel.disconnect();
  });
});
