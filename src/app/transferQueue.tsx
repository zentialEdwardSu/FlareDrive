import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { processTransferTask } from "./transfer";

export interface TransferTask {
  type: "upload" | "download";
  status:
    | "queued"
    | "in-progress"
    | "started"
    | "completed"
    | "failed"
    | "cancelled";
  id: string;
  remoteKey: string;
  file?: File;
  name: string;
  loaded: number;
  total: number;
  createdAt: number;
  updatedAt: number;
  error?: any;
}

const TransferQueueContext = createContext<TransferTask[]>([]);
const SetTransferQueueContext = createContext<
  React.Dispatch<React.SetStateAction<TransferTask[]>>
>(() => {});

function newTaskId() {
  return `${Date.now()}-${crypto.randomUUID?.() ?? Math.random()}`;
}

function taskNameFromKey(key: string) {
  return key.replace(/\/$/, "").split("/").pop() || key || "Download";
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function useTransferQueue() {
  return useContext(TransferQueueContext);
}

export function useTransferActions() {
  const setTransferTasks = useContext(SetTransferQueueContext);
  return {
    retryTask: (taskId: string) => {
      setTransferTasks((tasks) =>
        tasks.map((task) =>
          task.id === taskId && task.status === "failed"
            ? {
                ...task,
                status: "queued",
                loaded: 0,
                error: undefined,
                updatedAt: Date.now(),
              }
            : task
        )
      );
    },
    cancelTask: (taskId: string) => {
      setTransferTasks((tasks) =>
        tasks.map((task) =>
          task.id === taskId && task.status === "queued"
            ? { ...task, status: "cancelled", updatedAt: Date.now() }
            : task
        )
      );
    },
    clearFinished: () => {
      setTransferTasks((tasks) =>
        tasks.filter(
          (task) =>
            !["started", "completed", "failed", "cancelled"].includes(
              task.status
            )
        )
      );
    },
  };
}

export function useUploadEnqueue() {
  const setTransferTasks = useContext(SetTransferQueueContext);
  return (...requests: { basedir: string; file: File }[]) => {
    const createdAt = Date.now();
    const newTasks = requests.map(
      ({ basedir, file }) =>
        ({
          type: "upload",
          status: "queued",
          id: newTaskId(),
          name: file.name,
          file,
          remoteKey: basedir + file.name,
          loaded: 0,
          total: file.size,
          createdAt,
          updatedAt: createdAt,
        } as TransferTask)
    );
    setTransferTasks((tasks) => [...tasks, ...newTasks]);
  };
}

export function useDownloadEnqueue() {
  const setTransferTasks = useContext(SetTransferQueueContext);
  return (...requests: { remoteKey: string; total?: number }[]) => {
    const createdAt = Date.now();
    const newTasks = requests.map(
      ({ remoteKey, total }) => {
        const anchor = document.createElement("a");
        anchor.href = `/webdav/${encodeKey(remoteKey)}`;
        anchor.download = taskNameFromKey(remoteKey);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        return {
          type: "download",
          status: "started",
          id: newTaskId(),
          name: taskNameFromKey(remoteKey),
          remoteKey,
          loaded: total ?? 0,
          total: total ?? 0,
          createdAt,
          updatedAt: createdAt,
        } as TransferTask;
      }
    );
    setTransferTasks((tasks) => [...tasks, ...newTasks]);
  };
}

export function TransferQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const processingTaskId = useRef<string | null>(null);

  function taskUpdater(taskId: string, props: Partial<TransferTask>) {
    return (tasks: TransferTask[]) => {
      return tasks.map((task) =>
        task.id === taskId
          ? { ...task, ...props, updatedAt: Date.now() }
          : task
      );
    };
  }

  useEffect(() => {
    const taskToProcess = transferTasks.find(
      (task) => task.status === "queued"
    );
    if (!taskToProcess || processingTaskId.current) return;
    processingTaskId.current = taskToProcess.id;

    setTransferTasks(taskUpdater(taskToProcess.id, { status: "in-progress" }));

    processTransferTask({
      task: taskToProcess,
      onTaskProgress: ({ loaded }) => {
        setTransferTasks(taskUpdater(taskToProcess.id, { loaded }));
      },
    })
      .then((result) => {
        setTransferTasks(
          taskUpdater(taskToProcess.id, result ?? { status: "completed" })
        );
        processingTaskId.current = null;
      })
      .catch((error) => {
        setTransferTasks(
          taskUpdater(taskToProcess.id, { status: "failed", error })
        );
        processingTaskId.current = null;
      });
  }, [transferTasks]);

  return (
    <TransferQueueContext.Provider value={transferTasks}>
      <SetTransferQueueContext.Provider value={setTransferTasks}>
        {children}
      </SetTransferQueueContext.Provider>
    </TransferQueueContext.Provider>
  );
}
