import {
  Box,
  Button,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  MoreHoriz as MoreHorizIcon,
  SyncAlt as SyncAltIcon,
} from "@mui/icons-material";

function Header({
  search,
  onSearchChange,
  setShowProgressDialog,
  onRegisterPasskey,
  onLogout,
}: {
  search: string;
  onSearchChange: (newSearch: string) => void;
  setShowProgressDialog: (show: boolean) => void;
  onRegisterPasskey: () => void;
  onLogout: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <Toolbar
      disableGutters
      sx={{
        minHeight: "56px !important",
        padding: 1,
        gap: 1,
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #D1D5DB",
      }}
    >
      <Typography
        variant="h6"
        sx={{
          display: { xs: "none", sm: "block" },
          fontWeight: 700,
          minWidth: 120,
        }}
      >
        FlareDrive
      </Typography>
      <Box
        sx={{
          display: { xs: "none", sm: "block" },
          width: "1px",
          alignSelf: "stretch",
          backgroundColor: "#D1D5DB",
        }}
      />
      <InputBase
        size="small"
        fullWidth
        placeholder="Search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        sx={{
          backgroundColor: "#F7F7F8",
          border: "1px solid #D1D5DB",
          borderRadius: 1,
          padding: "6px 12px",
        }}
      />
      <Button
        variant="outlined"
        startIcon={<SyncAltIcon />}
        sx={{
          display: { xs: "none", sm: "inline-flex" },
          whiteSpace: "nowrap",
        }}
        onClick={() => setShowProgressDialog(true)}
      >
        Transfers
      </Button>
      <IconButton
        aria-label="More"
        color="inherit"
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <MoreHorizIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          sx={{ display: { xs: "flex", sm: "none" } }}
          onClick={() => {
            setAnchorEl(null);
            setShowProgressDialog(true);
          }}
        >
          Transfers
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            onRegisterPasskey();
          }}
        >
          Add passkey
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            onLogout();
          }}
        >
          Sign out
        </MenuItem>
      </Menu>
    </Toolbar>
  );
}

export default Header;
