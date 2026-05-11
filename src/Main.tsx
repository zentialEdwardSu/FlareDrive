import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Link,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  CreateNewFolder as CreateNewFolderIcon,
  Home as HomeIcon,
  NoteAdd as NoteAddIcon,
  Refresh as RefreshIcon,
  Upload as UploadIcon,
} from "@mui/icons-material";

import FileGrid, {
  encodeKey,
  FileItem,
  FILE_DRAG_TYPE,
  isDirectory,
} from "./FileGrid";
import MultiSelectToolbar from "./MultiSelectToolbar";
import UploadDrawer, { UploadFab } from "./UploadDrawer";
import TextPadDrawer from "./TextPadDrawer";
import { webdavFetch } from "./app/auth";
import { copyPaste, createFolder, createShareLink, fetchPath } from "./app/transfer";
import {
  useDownloadEnqueue,
  useTransferQueue,
  useUploadEnqueue,
} from "./app/transferQueue";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      {children}
    </Box>
  );
}

function PathBreadcrumb({
  path,
  onCwdChange,
  onMove,
}: {
  path: string;
  onCwdChange: (newCwd: string) => void;
  onMove: (sourceKey: string, targetDirectory: string) => void;
}) {
  const parts = path.replace(/\/$/, "").split("/");
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDragOver = (
    event: React.DragEvent,
    targetDirectory: string
  ) => {
    if (!Array.from(event.dataTransfer.types).includes(FILE_DRAG_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(targetDirectory);
  };

  const handleDrop = (event: React.DragEvent, targetDirectory: string) => {
    const sourceKey = event.dataTransfer.getData(FILE_DRAG_TYPE);
    if (!sourceKey) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    onMove(sourceKey, targetDirectory);
  };

  const dropSx = (targetDirectory: string) => ({
    minWidth: 0,
    padding: "2px 4px",
    outline:
      dropTarget === targetDirectory
        ? "2px solid #FF4F00"
        : "2px solid transparent",
    outlineOffset: 1,
  });

  return (
    <Breadcrumbs separator="/" sx={{ padding: 1 }}>
      <Button
        onClick={() => onCwdChange("")}
        onDragOver={(event) => handleDragOver(event, "")}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => handleDrop(event, "")}
        sx={dropSx("")}
      >
        <HomeIcon />
      </Button>
      {parts.map((part, index) =>
        index === parts.length - 1 ? (
          <Typography
            key={index}
            color="text.primary"
            onDragOver={(event) =>
              handleDragOver(event, parts.slice(0, index + 1).join("/") + "/")
            }
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) =>
              handleDrop(event, parts.slice(0, index + 1).join("/") + "/")
            }
            sx={dropSx(parts.slice(0, index + 1).join("/") + "/")}
          >
            {part}
          </Typography>
        ) : (
          <Link
            key={index}
            component="button"
            onClick={() => {
              onCwdChange(parts.slice(0, index + 1).join("/") + "/");
            }}
            onDragOver={(event) =>
              handleDragOver(event, parts.slice(0, index + 1).join("/") + "/")
            }
            onDragLeave={() => setDropTarget(null)}
            onDrop={(event) =>
              handleDrop(event, parts.slice(0, index + 1).join("/") + "/")
            }
            sx={dropSx(parts.slice(0, index + 1).join("/") + "/")}
          >
            {part}
          </Link>
        )
      )}
    </Breadcrumbs>
  );
}

function DropZone({
  children,
  onDrop,
}: {
  children: React.ReactNode;
  onDrop: (files: FileList) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const isExternalFileDrag = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files") &&
    !Array.from(event.dataTransfer.types).includes(FILE_DRAG_TYPE);

  return (
    <Box
      sx={{
        position: "relative",
        flexGrow: 1,
        overflowY: "auto",
        backgroundColor: (theme) => theme.palette.background.default,
      }}
      onDragEnter={(event) => {
        if (!isExternalFileDrag(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!isExternalFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!isExternalFileDrag(event)) return;
        event.preventDefault();
        onDrop(event.dataTransfer.files);
        setDragging(false);
      }}
    >
      {dragging && (
        <Box
          sx={{
            position: "absolute",
            inset: 12,
            zIndex: 10,
            display: "grid",
            placeItems: "center",
            border: "2px solid #FF4F00",
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            pointerEvents: "none",
          }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Drop files to upload
          </Typography>
        </Box>
      )}
      {children}
    </Box>
  );
}

function Main({
  search,
  onError,
}: {
  search: string;
  onError: (error: Error) => void;
}) {
  const [cwd, setCwd] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [multiSelected, setMultiSelected] = useState<string[] | null>(null);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [showTextPadDrawer, setShowTextPadDrawer] = useState(false);
  const [lastUploadKey, setLastUploadKey] = useState<string | null>(null);

  const theme = useTheme();
  const showInlineActions = useMediaQuery(theme.breakpoints.up("md"));
  const transferQueue = useTransferQueue();
  const uploadEnqueue = useUploadEnqueue();
  const downloadEnqueue = useDownloadEnqueue();

  const fetchFiles = useCallback(() => {
    fetchPath(cwd)
      .then((files) => {
        setFiles(files);
        setMultiSelected(null);
      })
      .catch(onError)
      .finally(() => setLoading(false));
  }, [cwd, onError]);

  useEffect(() => setLoading(true), [cwd]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    const lastFile = [...transferQueue]
      .reverse()
      .find((task) => task.type === "upload");
    if (!lastFile) return;
    if (["queued", "in-progress"].includes(lastFile.status)) {
      setLastUploadKey(lastFile.remoteKey);
    } else if (lastUploadKey) {
      fetchFiles();
      setLastUploadKey(null);
    }
  }, [cwd, fetchFiles, lastUploadKey, transferQueue]);

  const filteredFiles = useMemo(
    () =>
      (search
        ? files.filter((file) =>
            file.key.toLowerCase().includes(search.toLowerCase())
          )
        : files
      ).sort((a, b) => (isDirectory(a) ? -1 : isDirectory(b) ? 1 : 0)),
    [files, search]
  );

  const handleMultiSelect = useCallback((key: string) => {
    setMultiSelected((prev) => {
      if (prev === null) return [key];
      if (prev.includes(key)) {
        const updated = prev.filter((k) => k !== key);
        return updated.length ? updated : null;
      }
      return [...prev, key];
    });
  }, []);

  const enqueueDownload = useCallback(
    (key: string) => {
      const selectedFile = files.find((file) => file.key === key);
      downloadEnqueue({
        remoteKey: key,
        total: selectedFile?.size,
      });
    },
    [downloadEnqueue, files]
  );

  const handleMove = useCallback(
    async (sourceKey: string, targetDirectory: string) => {
      const sourceFile = files.find((file) => file.key === sourceKey);
      const normalizedSourceKey = sourceKey.replace(/\/$/, "");
      const sourceName = normalizedSourceKey.split("/").pop();
      if (!sourceFile || !sourceName) return;

      const normalizedTargetDirectory = targetDirectory
        ? `${targetDirectory.replace(/\/$/, "")}/`
        : "";
      const sourceDirectory = normalizedSourceKey.includes("/")
        ? normalizedSourceKey.slice(0, normalizedSourceKey.lastIndexOf("/") + 1)
        : "";
      const nextKey = `${normalizedTargetDirectory}${sourceName}`;

      if (nextKey === normalizedSourceKey) return;
      if (
        isDirectory(sourceFile) &&
        normalizedTargetDirectory.startsWith(`${normalizedSourceKey}/`)
      ) {
        window.alert("Cannot move a folder into itself.");
        return;
      }
      if (sourceDirectory === normalizedTargetDirectory) return;

      try {
        await copyPaste(sourceKey, nextKey, true);
        fetchFiles();
      } catch (error) {
        onError(error as Error);
      }
    },
    [fetchFiles, files, onError]
  );

  return (
    <>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        sx={{
          borderTop: "1px solid #E5E7EB",
          borderBottom: "1px solid #D1D5DB",
          backgroundColor: "#FFFFFF",
          paddingX: { xs: 0, md: 1 },
        }}
      >
        {cwd ? (
          <PathBreadcrumb path={cwd} onCwdChange={setCwd} onMove={handleMove} />
        ) : (
          <Box
            sx={{
              padding: 1,
              outline: "2px solid transparent",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Root
            </Typography>
          </Box>
        )}
        {showInlineActions && (
          <Stack direction="row" spacing={1} sx={{ padding: 1 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<UploadIcon />}
              onClick={() => setShowUploadDrawer(true)}
            >
              Upload
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CreateNewFolderIcon />}
              onClick={async () => {
                await createFolder(cwd);
                fetchFiles();
              }}
            >
              New folder
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<NoteAddIcon />}
              onClick={() => setShowTextPadDrawer(true)}
            >
              TextPad
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchFiles}
            >
              Refresh
            </Button>
          </Stack>
        )}
      </Stack>

      {loading ? (
        <Centered>
          <CircularProgress />
        </Centered>
      ) : (
        <DropZone
          onDrop={(files) => {
            uploadEnqueue(
              ...Array.from(files).map((file) => ({ file, basedir: cwd }))
            );
          }}
        >
          <FileGrid
            files={filteredFiles}
            onCwdChange={(newCwd: string) => setCwd(newCwd)}
            multiSelected={multiSelected}
            onMultiSelect={handleMultiSelect}
            onDownload={(file) => enqueueDownload(file.key)}
            onMove={handleMove}
            emptyMessage={<Centered>No files or folders</Centered>}
          />
        </DropZone>
      )}

      {multiSelected === null && !showInlineActions && (
        <>
          <UploadFab onClick={() => setShowUploadDrawer(true)} />
          <Button
            variant="contained"
            startIcon={<NoteAddIcon />}
            sx={{
              position: "fixed",
              bottom: 90,
              right: 24,
              zIndex: 999,
            }}
            onClick={() => setShowTextPadDrawer(true)}
          >
            TextPad
          </Button>
        </>
      )}

      <UploadDrawer
        open={showUploadDrawer}
        setOpen={setShowUploadDrawer}
        cwd={cwd}
        onUpload={fetchFiles}
      />

      <TextPadDrawer
        open={showTextPadDrawer}
        setOpen={setShowTextPadDrawer}
        cwd={cwd}
        onUpload={fetchFiles}
      />

      <MultiSelectToolbar
        multiSelected={multiSelected}
        onClose={() => setMultiSelected(null)}
        onDownload={() => {
          if (multiSelected?.length !== 1) return;
          enqueueDownload(multiSelected[0]);
        }}
        onRename={async () => {
          if (multiSelected?.length !== 1) return;
          const newName = window.prompt("Rename to:");
          if (!newName) return;
          await copyPaste(multiSelected[0], cwd + newName, true);
          fetchFiles();
        }}
        onDelete={async () => {
          if (!multiSelected?.length) return;
          const filenames = multiSelected
            .map((key) => key.replace(/\/$/, "").split("/").pop())
            .join("\n");
          const confirmMessage = "Delete the following file(s) permanently?";
          if (!window.confirm(`${confirmMessage}\n${filenames}`)) return;
          for (const key of multiSelected)
            await webdavFetch(`/webdav/${encodeKey(key)}`, { method: "DELETE" });
          fetchFiles();
        }}
        onShare={async () => {
          if (multiSelected?.length !== 1) return;
          try {
            const share = await createShareLink(multiSelected[0]);
            if (navigator.share) {
              await navigator.share({ url: share.url });
            } else {
              await navigator.clipboard.writeText(share.url);
            }
          } catch (error) {
            onError(error as Error);
          }
        }}
      />
    </>
  );
}

export default Main;
