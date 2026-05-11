import React from "react";
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Download as DownloadIcon } from "@mui/icons-material";

import MimeIcon from "./MimeIcon";
import { humanReadableSize } from "./app/utils";

export const FILE_DRAG_TYPE = "application/x-flaredrive-key";

const GRID_GAP = 12;
const MIN_GRID_ITEM_WIDTH = 184;

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

function FileIcon({ file, size = 36 }: { file: FileItem; size?: number }) {
  const content = file.customMetadata?.thumbnail ? (
    <img
      src={`/webdav/_$flaredrive$/thumbnails/${file.customMetadata.thumbnail}.png`}
      alt={extractFilename(file.key)}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size, objectFit: "cover" }}
    />
  ) : (
    <MimeIcon contentType={file.httpMetadata.contentType} />
  );

  return (
    <Box
      sx={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        color: "text.secondary",
        "& svg": { fontSize: size },
      }}
    >
      {content}
    </Box>
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

type FileLayout = {
  kind: "grid" | "list";
  columns: number;
};

function useResponsiveFileLayout() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = React.useState<FileLayout>({
    kind: "grid",
    columns: 3,
  });

  React.useEffect(() => {
    let animationFrame: number | null = null;

    const measure = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const width = containerRef.current?.clientWidth ?? 0;
        if (width <= 0) return;

        const columns = Math.max(
          1,
          Math.floor((width + GRID_GAP) / (MIN_GRID_ITEM_WIDTH + GRID_GAP))
        );
        const nextLayout: FileLayout = {
          kind: columns >= 2 ? "grid" : "list",
          columns,
        };

        setLayout((current) =>
          current.kind === nextLayout.kind && current.columns === nextLayout.columns
            ? current
            : nextLayout
        );
      });
    };

    const observer = new ResizeObserver(measure);
    const current = containerRef.current;
    if (current) observer.observe(current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  return { containerRef, layout };
}

function FileTile({
  file,
  layout,
  selected,
  dropTarget,
  setDropTarget,
  onCwdChange,
  multiSelected,
  onMultiSelect,
  onDownload,
  onMove,
}: FileGridProps & {
  file: FileItem;
  layout: FileLayout["kind"];
  selected: boolean;
  dropTarget: string | null;
  setDropTarget: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const filename = extractFilename(file.key);
  const isList = layout === "list";
  const modified = new Date(file.uploaded).toLocaleString();
  const size = isDirectory(file) ? "" : humanReadableSize(file.size);

  const handleOpen = () => {
    if (multiSelected !== null) onMultiSelect(file.key);
    else openFile(file, onCwdChange);
  };

  return (
    <Box
      role="button"
      tabIndex={0}
      draggable={multiSelected === null}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(FILE_DRAG_TYPE, file.key);
        event.dataTransfer.setData("text/plain", filename);
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
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleOpen();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMultiSelect(file.key);
      }}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: isList ? "36px minmax(0, 1fr) auto" : "1fr",
        alignItems: isList ? "center" : "start",
        gap: isList ? 1.5 : 1,
        minHeight: isList ? 64 : 154,
        width: "100%",
        padding: isList ? "10px 12px" : "12px",
        border: isList ? 0 : "1px solid #D1D5DB",
        borderBottom: isList ? "1px solid #E5E7EB" : undefined,
        borderRadius: 0,
        outline:
          dropTarget === file.key ? "2px solid #FF4F00" : "2px solid transparent",
        outlineOffset: "-2px",
        backgroundColor: selected ? "rgba(255, 79, 0, 0.08)" : "#FFFFFF",
        cursor: "pointer",
        textAlign: "left",
        userSelect: "none",
        transition: "background-color 120ms ease, border-color 120ms ease",
        "&:hover": {
          borderColor: "#FF4F00",
          backgroundColor: selected ? "rgba(255, 79, 0, 0.12)" : "#F7F7F8",
        },
        "&:focus-visible": {
          outline: "2px solid #FF4F00",
          outlineOffset: "-2px",
        },
      }}
    >
      <Box sx={{ justifySelf: isList ? "start" : "center" }}>
        <FileIcon file={file} size={isList ? 36 : 44} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          title={filename}
          noWrap
          sx={{
            fontWeight: 700,
            fontSize: isList ? 14 : 15,
            lineHeight: 1.25,
          }}
        >
          {filename}
        </Typography>
        <Stack
          direction={isList ? "row" : "column"}
          spacing={isList ? 1 : 0.25}
          sx={{ minWidth: 0, marginTop: 0.5 }}
        >
          <Typography variant="caption" color="text.secondary" noWrap>
            {isList ? (size || "Folder") : fileKind(file)}
          </Typography>
          {!isList && size && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {size}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" noWrap>
            {modified}
          </Typography>
        </Stack>
      </Box>
      {!isDirectory(file) && onDownload && (
        <Tooltip title="Download">
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onDownload(file);
            }}
            sx={{
              position: isList ? "static" : "absolute",
              top: isList ? "auto" : 8,
              right: isList ? "auto" : 8,
              color: "text.secondary",
            }}
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

function ResponsiveFiles(props: FileGridProps) {
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const { containerRef, layout } = useResponsiveFileLayout();
  const isList = layout.kind === "list";

  return (
    <Box
      ref={containerRef}
      sx={{
        display: isList ? "block" : "grid",
        gridTemplateColumns: isList
          ? undefined
          : `repeat(${layout.columns}, minmax(0, 1fr))`,
        gap: isList ? 0 : `${GRID_GAP}px`,
        padding: isList ? 0 : 1.5,
        paddingBottom: isList ? "96px" : 1.5,
      }}
    >
      {props.files.map((file) => (
        <FileTile
          key={file.key}
          {...props}
          file={file}
          layout={layout.kind}
          selected={Boolean(props.multiSelected?.includes(file.key))}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
        />
      ))}
    </Box>
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
};

function FileGrid(props: FileGridProps) {
  if (props.files.length === 0) return props.emptyMessage;
  return <ResponsiveFiles {...props} />;
}

export default FileGrid;
