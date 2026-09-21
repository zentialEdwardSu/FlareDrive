import { useState } from "react";
import { Button, IconButton, Menu, MenuItem, Slide, Toolbar, Typography } from "@mui/material";
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  MoreHoriz as MoreHorizIcon,
} from "@mui/icons-material";

function MultiSelectToolbar({
  multiSelected,
  onClose,
  onDownload,
  onRename,
  onDelete,
  onShare,
  desktop = false,
  selectedIsDirectory = false,
}: {
  multiSelected: string[] | null;
  onClose: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
  desktop?: boolean;
  selectedIsDirectory?: boolean;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <Slide direction={desktop ? "down" : "up"} in={multiSelected !== null}>
      <Toolbar
        sx={{
          position: desktop ? "static" : "fixed",
          bottom: desktop ? undefined : 0,
          left: desktop ? undefined : 0,
          right: desktop ? undefined : 0,
          zIndex: 100,
          backgroundColor: (theme) => theme.palette.background.paper,
          borderTop: "1px solid lightgray",
          justifyContent: desktop ? "flex-start" : "space-evenly",
          gap: desktop ? 1 : 0,
          minHeight: desktop ? "48px !important" : undefined,
        }}
      >
        <IconButton color="primary" onClick={onClose} aria-label="Clear selection">
          <CloseIcon />
        </IconButton>
        {desktop && (
          <Typography variant="body2" sx={{ mr: 1 }}>
            {multiSelected?.length ?? 0} selected
          </Typography>
        )}
        {desktop ? (
          <>
            <Button startIcon={<DownloadIcon />} disabled={multiSelected?.length !== 1 || selectedIsDirectory} onClick={onDownload}>Download</Button>
            <Button startIcon={<DeleteIcon />} color="error" onClick={onDelete}>Delete</Button>
            {multiSelected?.length === 1 && <Button onClick={onRename}>Rename</Button>}
            {multiSelected?.length === 1 && !selectedIsDirectory && <Button onClick={onShare}>Share</Button>}
          </>
        ) : (
          <>
        <IconButton
          aria-label="Download selected file"
          color="primary"
          disabled={
            multiSelected?.length !== 1 || selectedIsDirectory
          }
          onClick={onDownload}
        >
          <DownloadIcon />
        </IconButton>
        <IconButton aria-label="Delete selected files" color="primary" onClick={onDelete}>
          <DeleteIcon />
        </IconButton>
        <IconButton
          aria-label="More actions"
          color="primary"
          disabled={
            multiSelected?.length !== 1 || selectedIsDirectory
          }
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
          </>
        )}
        {multiSelected?.length && (
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            {multiSelected.length === 1 && <MenuItem onClick={onRename}>Rename</MenuItem>}
            {multiSelected.length === 1 && <MenuItem onClick={onShare}>Share</MenuItem>}
          </Menu>
        )}
      </Toolbar>
    </Slide>
  );
}

export default MultiSelectToolbar;
