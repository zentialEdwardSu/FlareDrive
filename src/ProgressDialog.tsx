import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useMemo, useState } from "react";
import {
  CheckCircleOutline as CheckCircleOutlineIcon,
  Close as CloseIcon,
  ErrorOutline as ErrorOutlineIcon,
  HourglassEmpty as HourglassEmptyIcon,
  OpenInBrowser as OpenInBrowserIcon,
  Replay as ReplayIcon,
} from "@mui/icons-material";

import {
  TransferTask,
  useTransferActions,
  useTransferQueue,
} from "./app/transferQueue";
import { humanReadableSize } from "./app/utils";

function statusText(task: TransferTask) {
  if (task.status === "queued") return "Queued";
  if (task.status === "in-progress") return task.type === "upload" ? "Uploading" : "Preparing";
  if (task.status === "started") return "Started in browser";
  if (task.status === "completed") return "Completed";
  if (task.status === "cancelled") return "Cancelled";
  return "Failed";
}

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
  const sizeLabel = task.total
    ? `${humanReadableSize(task.loaded)} / ${humanReadableSize(task.total)}`
    : statusText(task);

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
                {statusText(task)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {sizeLabel}
              </Typography>
            </Stack>
            {["queued", "in-progress"].includes(task.status) && (
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

function TransferMiniTray({ onOpen }: { onOpen: () => void }) {
  const transferQueue = useTransferQueue();
  const active = transferQueue.filter((task) =>
    ["queued", "in-progress"].includes(task.status)
  );
  const failed = transferQueue.filter((task) => task.status === "failed");

  if (!transferQueue.length || (!active.length && !failed.length)) return null;

  return (
    <Button
      variant="contained"
      onClick={onOpen}
      sx={{
        position: "fixed",
        right: { xs: 16, md: 24 },
        bottom: { xs: 80, md: 24 },
        zIndex: 1200,
        borderRadius: 1,
        textTransform: "none",
        boxShadow: "none",
      }}
    >
      Transfers {active.length ? active.length : failed.length}
    </Button>
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

  return (
    <>
      <TransferMiniTray onOpen={onOpen} />
      {isMobile ? (
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
      ) : (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
          <DialogTitle>Transfers</DialogTitle>
          <DialogContent sx={{ padding: 0 }}>
            <TransferContent />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export default ProgressDialog;

