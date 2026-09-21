/// <reference types="jest" />

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { act } from "react";
import { ShareDialog } from "./ShareDialogs";

const activeShare = {
  id: "share-id",
  path: "documents/report.pdf",
  token: "token",
  objectVersion: "etag:1",
  createdAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
  revokedAt: null,
  status: "active",
  url: "https://drive.example/webdav/documents/report.pdf?share=token",
};

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function renderDialog() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <ShareDialog open filePath="documents/report.pdf" onClose={() => {}} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
});

test("waits for the link, then invokes system share from its own button click", async () => {
  let resolveFetch!: (value: Response) => void;
  globalThis.fetch = jest.fn(
    () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
  ) as jest.Mock;

  renderDialog();
  expect(screen.queryByRole("button", { name: "System share" })).toBeNull();

  await act(async () => resolveFetch(await response({ share: activeShare })));
  const shareButton = await screen.findByRole("button", { name: "System share" });
  fireEvent.click(shareButton);

  expect(navigator.share).toHaveBeenCalledWith({
    title: "report.pdf",
    url: activeShare.url,
  });
});

test("creates a missing link with the default seven-day expiry", async () => {
  globalThis.fetch = jest.fn()
    .mockImplementationOnce(() => response({ share: null }))
    .mockImplementationOnce(() => response({ share: activeShare }, 201));

  renderDialog();
  const createButton = await screen.findByRole("button", { name: "Create share link" });
  fireEvent.click(createButton);

  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  await screen.findByText("Share link created");
  const [, request] = (globalThis.fetch as jest.Mock).mock.calls[1];
  const body = JSON.parse(request.body);
  expect(body.path).toBe("documents/report.pdf");
  expect(body.expiresAt).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  expect(body.expiresAt).toBeLessThan(Date.now() + 8 * 86_400_000);
});

test("silently accepts cancellation of the native share sheet", async () => {
  (navigator.share as jest.Mock).mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  globalThis.fetch = jest.fn(() => response({ share: activeShare })) as jest.Mock;
  renderDialog();

  fireEvent.click(await screen.findByRole("button", { name: "System share" }));
  await waitFor(() => expect(navigator.share).toHaveBeenCalled());
  expect(screen.queryByRole("alert")).toBeNull();
});
