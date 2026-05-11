import { ThemeProvider } from "@emotion/react";
import {
  createTheme,
  CssBaseline,
  GlobalStyles,
  Snackbar,
  Stack,
} from "@mui/material";
import React, { useEffect, useState } from "react";

import Header from "./Header";
import Login from "./Login";
import Main from "./Main";
import ProgressDialog from "./ProgressDialog";
import { TransferQueueProvider } from "./app/transferQueue";
import { AuthSession, getAuthSession, logout, registerPasskey } from "./app/auth";
import { clearThumbnailCache } from "./app/thumbnailCacheServiceWorker";

const globalStyles = (
  <GlobalStyles
    styles={{
      "html, body, #root": { height: "100%" },
      body: { backgroundColor: "#F7F7F8" },
    }}
  />
);

const theme = createTheme({
  palette: {
    primary: { main: "#FF4F00" },
    background: { default: "#F7F7F8", paper: "#FFFFFF" },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "Helvetica Neue, Arial, sans-serif",
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", boxShadow: "none" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#F7F7F8",
          fontWeight: 700,
        },
      },
    },
  },
});

function App() {
  const [search, setSearch] = useState("");
  const [showProgressDialog, setShowProgressDialog] = React.useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);

  const refreshAuthSession = () => {
    getAuthSession()
      .then(setAuthSession)
      .catch((error) => setError(error as Error));
  };

  useEffect(refreshAuthSession, []);

  const handleRegisterPasskey = async () => {
    try {
      await registerPasskey();
      refreshAuthSession();
    } catch (error) {
      setError(error as Error);
    }
  };

  const handleLogout = async () => {
    try {
      await clearThumbnailCache();
      await logout();
      refreshAuthSession();
    } catch (error) {
      setError(error as Error);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {globalStyles}
      <TransferQueueProvider>
        {authSession?.authenticated ? (
          <Stack sx={{ height: "100%" }}>
            <Header
              search={search}
              onSearchChange={(newSearch: string) => setSearch(newSearch)}
              setShowProgressDialog={setShowProgressDialog}
              onRegisterPasskey={handleRegisterPasskey}
              onLogout={handleLogout}
            />
            <Main search={search} onError={setError} />
          </Stack>
        ) : (
          <Login
            passkeyAvailable={Boolean(authSession?.passkeyAvailable)}
            onAuthenticated={refreshAuthSession}
            onError={setError}
          />
        )}
        <Snackbar
          autoHideDuration={5000}
          open={Boolean(error)}
          message={error?.message}
          onClose={() => setError(null)}
        />
        <ProgressDialog
          open={showProgressDialog}
          onOpen={() => setShowProgressDialog(true)}
          onClose={() => setShowProgressDialog(false)}
        />
      </TransferQueueProvider>
    </ThemeProvider>
  );
}

export default App;
