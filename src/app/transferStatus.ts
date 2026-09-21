import type { TransferTask } from "./transferQueue";

export function transferStatusText(task: TransferTask) {
  if (task.status === "queued") return "Queued";
  if (task.status === "in-progress") return task.type === "upload" ? "Uploading" : "Preparing";
  if (task.status === "started") return "Handed to browser";
  if (task.status === "completed") return "Completed";
  if (task.status === "cancelled") return "Cancelled";
  return "Failed";
}
