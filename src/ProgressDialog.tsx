import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleOutline as CheckCircleOutlineIcon,
  Close as CloseIcon,
  ErrorOutline as ErrorOutlineIcon,
  HourglassEmpty as HourglassEmptyIcon,
  OpenInBrowser as OpenInBrowserIcon,
  Replay as ReplayIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
} from "@mui/icons-material";

import {
  TransferTask,
  useTransferActions,
  useTransferQueue,
} from "./app/transferQueue";
import { humanReadableSize } from "./app/utils";
import { transferStatusText } from "./app/transferStatus";

function taskProgress(task: TransferTask) {
  if (!task.total) return 0;
  return Math.min(100, Math.round((task.loaded / task.total) * 100));
}

function TaskIcon({ task }: { task: TransferTask }) {
  if (task.status === "failed") {
    return (
      <Tooltip title={task.error?.message ?? "Failed"}>
        <ErrorOutlineIcon color="error" />
      </Tooltip>
    );
  }
  if (task.status === "completed") return <CheckCircleOutlineIcon color="success" />;
  if (task.status === "started") return <OpenInBrowserIcon color="primary" />;
  return <HourglassEmptyIcon color="action" />;
}

function TransferTaskRow({ task }: { task: TransferTask }) {
  const { retryTask, cancelTask } = useTransferActions();
  const progress = taskProgress(task);
  const sizeLabel = task.type === "download" && task.status === "started"
    ? "Browser download"
    : task.total
    ? `${humanReadableSize(task.loaded)} / ${humanReadableSize(task.total)}`
    : transferStatusText(task);

  return (
    <ListItem
      divider
      secondaryAction={
        <Stack direction="row" spacing={0.5}>
          {task.status === "failed" && (
            <Tooltip title="Retry">
              <IconButton edge="end" onClick={() => retryTask(task.id)}>
                <ReplayIcon />
              </IconButton>
            </Tooltip>
          )}
          {task.status === "queued" && (
            <Tooltip title="Cancel">
              <IconButton edge="end" onClick={() => cancelTask(task.id)}>
                <CloseIcon />
              </IconButton>
            </Tooltip>
          )}
          <TaskIcon task={task} />
        </Stack>
      }
      sx={{ alignItems: "flex-start", paddingY: 1.25 }}
    >
      <ListItemText
        primary={task.name}
        primaryTypographyProps={{
          noWrap: true,
          sx: { paddingRight: 6 },
        }}
        secondary={
          <Stack spacing={0.75} sx={{ paddingRight: 6, paddingTop: 0.5 }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="caption" color="text.secondary">
                {transferStatusText(task)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {sizeLabel}
              </Typography>
            </Stack>
            {task.type === "upload" && ["queued", "in-progress"].includes(task.status) && (
              <LinearProgress
                variant={task.total ? "determinate" : "indeterminate"}
                value={progress}
                sx={{ height: 3, borderRadius: 0 }}
              />
            )}
          </Stack>
        }
      />
    </ListItem>
  );
}

function TransferContent() {
  const [tab, setTab] = useState(0);
  const transferQueue = useTransferQueue();
  const { clearFinished } = useTransferActions();

  const tasks = useMemo(() => {
    const taskType = tab === 0 ? "upload" : "download";
    return transferQueue.filter((task) => task.type === taskType);
  }, [tab, transferQueue]);

  return (
    <>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ paddingX: 2, paddingTop: 1 }}
      >
        <Tabs value={tab} onChange={(_, newTab) => setTab(newTab)}>
          <Tab label="Uploads" />
          <Tab label="Downloads" />
        </Tabs>
        <Button size="small" onClick={clearFinished}>
          Clear
        </Button>
      </Stack>
      <Divider />
      {tasks.length === 0 ? (
        <Box sx={{ padding: 3 }}>
          <Typography textAlign="center" color="text.secondary">
            No transfers
          </Typography>
        </Box>
      ) : (
        <List disablePadding>
          {tasks.map((task) => (
            <TransferTaskRow key={task.id} task={task} />
          ))}
        </List>
      )}
    </>
  );
}

function transferSummary(transferQueue: TransferTask[]) {
  const active = transferQueue.filter((task) => ["queued", "in-progress"].includes(task.status));
  const failed = transferQueue.filter((task) => task.status === "failed");
  const uploads = active.filter((task) => task.type === "upload" && task.total > 0);
  const total = uploads.reduce((sum, task) => sum + task.total, 0);
  const loaded = uploads.reduce((sum, task) => sum + task.loaded, 0);
  return { active, failed, progress: total ? Math.round((loaded / total) * 100) : 0, determinate: total > 0 };
}

function MobileTransferTray({ onOpen }: { onOpen: () => void }) {
  const transferQueue = useTransferQueue();
  const { active, failed, progress, determinate } = transferSummary(transferQueue);

  if (!transferQueue.length || (!active.length && !failed.length)) return null;

  return (
    <Paper
      component="button"
      onClick={onOpen}
      sx={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 76,
        zIndex: 1200,
        borderRadius: 1,
        border: "1px solid",
        borderColor: failed.length ? "error.main" : "divider",
        p: 1.25,
        textAlign: "left",
        backgroundColor: "background.paper",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight={600}>
          {failed.length ? `${failed.length} transfer failed` : `${active.length} transfer${active.length === 1 ? "" : "s"} active`}
        </Typography>
        <Typography variant="caption">{determinate ? `${progress}%` : "View"}</Typography>
      </Stack>
      {active.length > 0 && (
        <LinearProgress variant={determinate ? "determinate" : "indeterminate"} value={progress} sx={{ mt: 0.75, height: 3 }} />
      )}
    </Paper>
  );
}

function DesktopTransferPanel({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const transferQueue = useTransferQueue();
  const { active, failed, progress, determinate } = transferSummary(transferQueue);
  if (!open && transferQueue.length === 0) return null;

  return (
    <Paper
      elevation={8}
      sx={{ position: "fixed", right: 24, bottom: 24, width: 400, maxWidth: "calc(100vw - 48px)", zIndex: 1200, overflow: "hidden", border: "1px solid", borderColor: "divider" }}
    >
      <Button
        color="inherit"
        onClick={open ? onClose : onOpen}
        endIcon={open ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
        sx={{ width: "100%", justifyContent: "space-between", p: 1.5 }}
      >
        <Stack alignItems="flex-start">
          <Typography variant="subtitle2">Transfers</Typography>
          <Typography variant="caption" color={failed.length ? "error" : "text.secondary"}>
            {active.length ? `${active.length} active${determinate ? ` · ${progress}%` : ""}` : failed.length ? `${failed.length} failed` : "All transfers finished"}
          </Typography>
        </Stack>
      </Button>
      {!open && active.length > 0 && <LinearProgress variant={determinate ? "determinate" : "indeterminate"} value={progress} />}
      {open && <Box sx={{ maxHeight: "min(520px, 70vh)", overflowY: "auto" }}><TransferContent /></Box>}
    </Paper>
  );
}

function ProgressDialog({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const transferQueue = useTransferQueue();
  const newestTaskId = transferQueue[transferQueue.length - 1]?.id;
  const previousTaskId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isMobile && newestTaskId && newestTaskId !== previousTaskId.current) onOpen();
    previousTaskId.current = newestTaskId;
  }, [isMobile, newestTaskId, onOpen]);

  return (
    <>
      {isMobile ? (
        <>
          <MobileTransferTray onOpen={onOpen} />
          <Drawer
            anchor="bottom"
            open={open}
            onClose={onClose}
            PaperProps={{ sx: { borderRadius: "8px 8px 0 0", maxHeight: "80vh" } }}
          >
            <Box sx={{ padding: 2, paddingBottom: 0 }}>
              <Typography variant="h6">Transfers</Typography>
            </Box>
            <TransferContent />
          </Drawer>
        </>
      ) : (
        <DesktopTransferPanel open={open} onOpen={onOpen} onClose={onClose} />
      )}
    </>
  );
}

export default ProgressDialog;
