import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import {
  deletePasskey,
  listPasskeys,
  PasskeySummary,
  registerPasskey,
  renamePasskey,
} from "./app/auth";

export default function PasskeyManager({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPasskeys((await listPasskeys()).passkeys);
      setError(null);
    } catch (error) {
      setError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  const add = async () => {
    setBusy(true);
    try {
      await registerPasskey(name.trim() || undefined);
      setName("");
      await load();
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (passkey: PasskeySummary) => {
    const next = window.prompt("Passkey name", passkey.name)?.trim();
    if (!next || next === passkey.name) return;
    try {
      const updated = (await renamePasskey(passkey.id, next)).passkey;
      setPasskeys((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setError((error as Error).message);
    }
  };

  const remove = async (passkey: PasskeySummary) => {
    const last = passkeys.length === 1;
    const suffix = last ? " This is your last passkey; future sign-ins will require password or TOTP." : "";
    if (!window.confirm(`Remove “${passkey.name}” from this site?${suffix}`)) return;
    try {
      await deletePasskey(passkey.id);
      setPasskeys((items) => items.filter((item) => item.id !== passkey.id));
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Passkey management</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Removing a passkey here stops it signing in to FlareDrive. Remove its saved copy separately from your device or password manager.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField label="New passkey name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
            <Button variant="contained" disabled={busy} onClick={add} sx={{ minWidth: 130 }}>
              {busy ? "Adding…" : "Add passkey"}
            </Button>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          <List disablePadding>
            {passkeys.map((passkey) => (
              <ListItem
                key={passkey.id}
                divider
                disableGutters
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" onClick={() => rename(passkey)}>Rename</Button>
                    <Button size="small" color="error" onClick={() => remove(passkey)}>Delete</Button>
                  </Stack>
                }
              >
                <ListItemText
                  primary={passkey.name}
                  secondary={`Created ${new Date(passkey.createdAt).toLocaleString()} · Last used ${passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleString() : "No record"}`}
                  sx={{ pr: 18 }}
                />
              </ListItem>
            ))}
          </List>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
