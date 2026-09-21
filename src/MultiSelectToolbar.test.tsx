/// <reference types="jest" />

import { render, screen } from "@testing-library/react";
import MultiSelectToolbar from "./MultiSelectToolbar";

const actions = {
  onClose: jest.fn(),
  onDownload: jest.fn(),
  onRename: jest.fn(),
  onDelete: jest.fn(),
  onShare: jest.fn(),
};

test("uses an inline desktop toolbar and disables file-only actions for a folder", () => {
  render(
    <MultiSelectToolbar
      {...actions}
      desktop
      selectedIsDirectory
      multiSelected={["photos"]}
    />
  );

  expect(screen.getByText("1 selected")).not.toBeNull();
  expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  expect(screen.getByRole("button", { name: "Rename" })).not.toBeNull();
});

test("keeps labelled touch actions in the mobile toolbar", () => {
  render(<MultiSelectToolbar {...actions} multiSelected={["report.pdf"]} />);
  expect(screen.getByRole("button", { name: "Download selected file" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Delete selected files" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "More actions" })).not.toBeNull();
});
