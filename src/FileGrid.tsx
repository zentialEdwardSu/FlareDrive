import React from "react";
import {
  Box,
  IconButton,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Download as DownloadIcon } from "@mui/icons-material";

import MimeIcon from "./MimeIcon";
import { humanReadableSize } from "./app/utils";
import { ViewMode } from "./app/viewMode";

export const FILE_DRAG_TYPE = "application/x-flaredrive-key";

export interface FileItem {
  key: string;
  size: number;
  uploaded: string;
  httpMetadata: { contentType: string };
  customMetadata?: { thumbnail?: string };
}

function extractFilename(key: string) {
  return key.replace(/\/$/, "").split("/").pop() || key || "/";
}

export function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function isDirectory(file: FileItem) {
  return file.httpMetadata?.contentType === "application/x-directory";
}

function fileKind(file: FileItem) {
  if (isDirectory(file)) return "Folder";
  const contentType = file.httpMetadata?.contentType;
  return contentType?.split(";")[0] || "File";
}

function FileIcon({ file }: { file: FileItem }) {
  return file.customMetadata?.thumbnail ? (
    <img
      src={`/webdav/_$flaredrive$/thumbnails/${file.customMetadata.thumbnail}.png`}
      alt={file.key}
      style={{ width: 36, height: 36, objectFit: "cover" }}
    />
  ) : (
    <MimeIcon contentType={file.httpMetadata.contentType} />
  );
}

function openFile(file: FileItem, onCwdChange: (newCwd: string) => void) {
  if (isDirectory(file)) {
    onCwdChange(file.key + "/");
    return;
  }
  window.open(`/webdav/${encodeKey(file.key)}`, "_blank", "noopener,noreferrer");
}

function canAcceptDrop(file: FileItem) {
  return isDirectory(file);
}

function hasFileDrag(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes(FILE_DRAG_TYPE);
}

function MobileFileList({
  files,
  onCwdChange,
  multiSelected,
  onMultiSelect,
  onMove,
}: FileGridProps) {
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  return (
    <Box sx={{ paddingBottom: "96px" }}>
      {files.map((file) => (
        <ListItemButton
          key={file.key}
          selected={multiSelected?.includes(file.key)}
          draggable={multiSelected === null}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(FILE_DRAG_TYPE, file.key);
            event.dataTransfer.setData("text/plain", extractFilename(file.key));
          }}
          onDragEnd={() => setDropTarget(null)}
          onDragEnter={(event) => {
            if (!canAcceptDrop(file) || !hasFileDrag(event)) return;
            event.preventDefault();
            setDropTarget(file.key);
          }}
          onDragOver={(event) => {
            if (!canAcceptDrop(file) || !hasFileDrag(event)) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            setDropTarget(file.key);
          }}
          onDragLeave={() => {
            if (dropTarget === file.key) setDropTarget(null);
          }}
          onDrop={(event) => {
            const source = event.dataTransfer.getData(FILE_DRAG_TYPE);
            if (!source || !canAcceptDrop(file)) return;
            event.preventDefault();
            event.stopPropagation();
            setDropTarget(null);
            onMove?.(source, `${file.key.replace(/\/$/, "")}/`);
          }}
          onClick={() => {
            if (multiSelected !== null) onMultiSelect(file.key);
            else openFile(file, onCwdChange);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onMultiSelect(file.key);
          }}
          sx={{
            minHeight: 64,
            borderBottom: "1px solid #E5E7EB",
            outline:
              dropTarget === file.key ? "2px solid #FF4F00" : "2px solid transparent",
            outlineOffset: "-2px",
            userSelect: "none",
          }}
        >
          <ListItemIcon>
            <FileIcon file={file} />
          </ListItemIcon>
          <ListItemText
            primary={extractFilename(file.key)}
            primaryTypographyProps={{
              noWrap: true,
            }}
            secondary={
              <Stack direction="row" spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  {isDirectory(file) ? "Folder" : humanReadableSize(file.size)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {new Date(file.uploaded).toLocaleString()}
                </Typography>
              </Stack>
            }
          />
        </ListItemButton>
      ))}
    </Box>
  );
}

function DesktopFileTable({
  files,
  onCwdChange,
  multiSelected,
  onMultiSelect,
  onDownload,
  onMove,
}: FileGridProps) {
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  return (
    <TableContainer sx={{ borderTop: "1px solid #D1D5DB" }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: "48%" }}>Name</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="right">Size</TableCell>
            <TableCell>Modified</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {files.map((file) => {
            const selected = multiSelected?.includes(file.key);
            return (
              <TableRow
                key={file.key}
                hover
                selected={selected}
                draggable={multiSelected === null}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(FILE_DRAG_TYPE, file.key);
                  event.dataTransfer.setData("text/plain", extractFilename(file.key));
                }}
                onDragEnd={() => setDropTarget(null)}
                onDragEnter={(event) => {
                  if (!canAcceptDrop(file) || !hasFileDrag(event)) return;
                  event.preventDefault();
                  setDropTarget(file.key);
                }}
                onDragOver={(event) => {
                  if (!canAcceptDrop(file) || !hasFileDrag(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  setDropTarget(file.key);
                }}
                onDragLeave={() => {
                  if (dropTarget === file.key) setDropTarget(null);
                }}
                onDrop={(event) => {
                  const source = event.dataTransfer.getData(FILE_DRAG_TYPE);
                  if (!source || !canAcceptDrop(file)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDropTarget(null);
                  onMove?.(source, `${file.key.replace(/\/$/, "")}/`);
                }}
                onClick={() => {
                  if (multiSelected !== null) onMultiSelect(file.key);
                  else openFile(file, onCwdChange);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onMultiSelect(file.key);
                }}
                sx={{
                  cursor: "pointer",
                  "& td": { borderBottom: "1px solid #E5E7EB" },
                  ...(dropTarget === file.key && {
                    "& td": {
                      borderTop: "2px solid #FF4F00",
                      borderBottom: "2px solid #FF4F00",
                    },
                    "& td:first-of-type": { borderLeft: "2px solid #FF4F00" },
                    "& td:last-of-type": { borderRight: "2px solid #FF4F00" },
                  }),
                }}
              >
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{ width: 36, height: 36, flex: "0 0 auto" }}>
                      <FileIcon file={file} />
                    </Box>
                    <Typography noWrap title={extractFilename(file.key)}>
                      {extractFilename(file.key)}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>{fileKind(file)}</TableCell>
                <TableCell align="right">
                  {isDirectory(file) ? "" : humanReadableSize(file.size)}
                </TableCell>
                <TableCell>{new Date(file.uploaded).toLocaleString()}</TableCell>
                <TableCell align="right">
                  {!isDirectory(file) && onDownload && (
                    <Tooltip title="Download">
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDownload(file);
                        }}
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

type FileGridProps = {
  files: FileItem[];
  onCwdChange: (newCwd: string) => void;
  multiSelected: string[] | null;
  onMultiSelect: (key: string) => void;
  onDownload?: (file: FileItem) => void;
  onMove?: (sourceKey: string, targetDirectory: string) => void;
  emptyMessage?: React.ReactNode;
  viewMode: ViewMode;
};

function FileGrid(props: FileGridProps) {
  if (props.files.length === 0) return props.emptyMessage;
  return props.viewMode === "web" ? (
    <DesktopFileTable {...props} />
  ) : (
    <MobileFileList {...props} />
  );
}

export default FileGrid;
