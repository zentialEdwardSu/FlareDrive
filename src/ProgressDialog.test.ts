/// <reference types="jest" />

import { transferStatusText } from "./app/transferStatus";
import { TransferTask } from "./app/transferQueue";

test("describes browser-managed downloads without claiming measurable completion", () => {
  const task: TransferTask = {
    id: "download-1",
    type: "download",
    status: "started",
    remoteKey: "report.pdf",
    name: "report.pdf",
    loaded: 100,
    total: 100,
    createdAt: 1,
    updatedAt: 1,
  };
  expect(transferStatusText(task)).toBe("Handed to browser");
});
