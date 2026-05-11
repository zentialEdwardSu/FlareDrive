import { Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { Fingerprint as FingerprintIcon, Login as LoginIcon } from "@mui/icons-material";
import { FormEvent, useState } from "react";

import { passkeyLogin, passwordLogin } from "./app/auth";

function Login({
  passkeyAvailable,
  onAuthenticated,
  onError,
}: {
  passkeyAvailable: boolean;
  onAuthenticated: () => void;
  onError: (error: Error) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const runAuth = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
      onAuthenticated();
    } catch (error) {
      onError(error as Error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = (event: FormEvent) => {
    event.preventDefault();
    runAuth(() => passwordLogin(username, password));
  };

  return (
    <Box
      sx={{
        minHeight: "100%",
        display: "grid",
        placeItems: "center",
        backgroundColor: "#F7F7F8",
        backgroundImage:
          "linear-gradient(#E5E7EB 1px, transparent 1px), linear-gradient(90deg, #E5E7EB 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        padding: 2,
      }}
    >
      <Stack
        component="form"
        onSubmit={handlePasswordLogin}
        spacing={2}
        sx={{
          width: "100%",
          maxWidth: 360,
          backgroundColor: "#FFFFFF",
          border: "1px solid #D1D5DB",
          borderRadius: 1,
          padding: 3,
        }}
      >
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          FlareDrive
        </Typography>
        <TextField
          label="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          size="small"
          fullWidth
        />
        <TextField
          label="Password or TOTP"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          type="password"
          size="small"
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
          disabled={loading}
        >
          Sign in
        </Button>
        {passkeyAvailable && (
          <Button
            variant="outlined"
            startIcon={<FingerprintIcon />}
            disabled={loading}
            onClick={() => runAuth(passkeyLogin)}
          >
            Sign in with passkey
          </Button>
        )}
      </Stack>
    </Box>
  );
}

export default Login;

