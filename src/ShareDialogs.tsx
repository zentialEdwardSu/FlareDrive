import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useCallback, useEffect, useId, useState } from "react";
import {
  createShare,
  getShare,
  listShares,
  revokeShare,
  ShareRecord,
  updateShare,
} from "./app/shares";

type ExpiryChoice = "1" | "7" | "30" | "custom" | "permanent";

function expiryFromChoice(choice: ExpiryChoice, custom: string) {
  if (choice === "permanent") return null;
  if (choice === "custom") {
    const value = new Date(custom).getTime();
    if (!custom || !Number.isFinite(value) || value <= Date.now()) {
      throw new Error("Choose a future expiry date");
    }
    return value;
  }
  return Date.now() + Number(choice) * 24 * 60 * 60 * 1000;
}

function ExpiryFields({
  choice,
  custom,
  onChoice,
  onCustom,
}: {
  choice: ExpiryChoice;
  custom: string;
  onChoice: (value: ExpiryChoice) => void;
  onCustom: (value: string) => void;
}) {
  const labelId = useId();
  return (
    <Stack spacing={2}>
      <FormControl fullWidth>
        <InputLabel id={labelId}>Expires</InputLabel>
        <Select
          labelId={labelId}
          label="Expires"
          value={choice}
          onChange={(event) => onChoice(event.target.value as ExpiryChoice)}
        >
          <MenuItem value="1">In 1 day</MenuItem>
          <MenuItem value="7">In 7 days</MenuItem>
          <MenuItem value="30">In 30 days</MenuItem>
          <MenuItem value="custom">Custom date</MenuItem>
          <MenuItem value="permanent">Never</MenuItem>
        </Select>
      </FormControl>
      {choice === "custom" && (
        <TextField
          label="Custom expiry"
          type="datetime-local"
          value={custom}
          onChange={(event) => onCustom(event.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
      )}
    </Stack>
  );
}

function formatDate(value: number | null) {
  return value === null ? "Never" : new Date(value).toLocaleString();
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable");
  await navigator.clipboard.writeText(value);
}

export function ShareDialog({
  open,
  filePath,
  onClose,
}: {
  open: boolean;
  filePath: string | null;
  onClose: () => void;
}) {
  const [share, setShare] = useState<ShareRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<ExpiryChoice>("7");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open || !filePath) return;
    let current = true;
    setLoading(true);
    setShare(null);
    setChoice("7");
    setCustom("");
    setMessage(null);
    getShare(filePath)
      .then(({ share }) => {
        if (current) setShare(share);
      })
      .catch((error) => {
        if (current) setMessage({ severity: "error", text: (error as Error).message });
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [filePath, open]);

  const handleCreate = async () => {
    if (!filePath) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await createShare(filePath, expiryFromChoice(choice, custom));
      setShare(result.share);
      setMessage({ severity: "success", text: "Share link created" });
    } catch (error) {
      setMessage({ severity: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!share) return;
    try {
      await copyText(share.url);
      setMessage({ severity: "success", text: "Link copied" });
    } catch (error) {
      setMessage({ severity: "error", text: (error as Error).message });
    }
  };

  const handleSystemShare = async () => {
    if (!share || !navigator.share) return;
    try {
      await navigator.share({ title: filePath?.split("/").pop(), url: share.url });
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setMessage({ severity: "error", text: (error as Error).message });
      }
    }
  };

  const usable = share?.status === "active";
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Share file</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ paddingTop: 1 }}>
          <Typography noWrap title={filePath ?? ""} sx={{ fontWeight: 600 }}>
            {filePath?.split("/").pop()}
          </Typography>
          {loading ? (
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 120 }}>
              <CircularProgress size={28} />
            </Box>
          ) : usable && share ? (
            <>
              <TextField
                label="Share link"
                value={share.url}
                InputProps={{ readOnly: true }}
                onFocus={(event) => event.target.select()}
                fullWidth
              />
              <Typography variant="body2" color="text.secondary">
                Expires: {formatDate(share.expiresAt)}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button variant="contained" onClick={handleCopy}>Copy link</Button>
                {typeof navigator.share === "function" && (
                  <Button variant="outlined" onClick={handleSystemShare}>System share</Button>
                )}
              </Stack>
            </>
          ) : (
            <>
              {share && (
                <Alert severity="info">The previous link is {share.status}. Creating a new share generates a new link.</Alert>
              )}
              <ExpiryFields
                choice={choice}
                custom={custom}
                onChoice={setChoice}
                onCustom={setCustom}
              />
              <Button variant="contained" disabled={saving} onClick={handleCreate}>
                {saving ? "Creating…" : "Create share link"}
              </Button>
            </>
          )}
          {message && <Alert severity={message.severity}>{message.text}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

function ShareRow({ share, onChange }: { share: ShareRecord; onChange: (share: ShareRecord) => void }) {
  const [choice, setChoice] = useState<ExpiryChoice>("7");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  const update = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      onChange((await updateShare(share.id, expiryFromChoice(choice, custom))).share);
    } catch (error) {
      setFeedback({ severity: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm(`Revoke the share for ${share.path.split("/").pop()}?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      onChange((await revokeShare(share.id)).share);
    } catch (error) {
      setFeedback({ severity: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ListItem alignItems="flex-start" divider sx={{ display: "block", py: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <ListItemText
            primary={share.path.split("/").pop()}
            secondary={`${share.path} · Created ${new Date(share.createdAt).toLocaleString()}`}
            primaryTypographyProps={{ fontWeight: 600 }}
            secondaryTypographyProps={{ sx: { overflowWrap: "anywhere" } }}
          />
          <Chip size="small" label={share.status} color={share.status === "active" ? "success" : "default"} />
        </Stack>
        <Typography variant="body2" color="text.secondary">Expires: {formatDate(share.expiresAt)}</Typography>
        {share.status === "active" && (
          <>
            <ExpiryFields choice={choice} custom={custom} onChoice={setChoice} onCustom={setCustom} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button size="small" variant="outlined" disabled={busy} onClick={() => copyText(share.url)
                .then(() => setFeedback({ severity: "success", text: "Link copied" }))
                .catch((error) => setFeedback({ severity: "error", text: error.message }))}>Copy link</Button>
              <Button size="small" variant="outlined" disabled={busy} onClick={update}>Update expiry</Button>
              <Button size="small" color="error" disabled={busy} onClick={revoke}>Revoke</Button>
            </Stack>
          </>
        )}
        {feedback && <Alert severity={feedback.severity}>{feedback.text}</Alert>}
      </Stack>
    </ListItem>
  );
}

export function ShareManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listShares(next);
      setShares((current) => next ? [...current, ...result.shares] : result.shares);
      setCursor(result.cursor);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [load, open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle>Share management</DialogTitle>
      <DialogContent sx={{ paddingX: { xs: 0, sm: 3 } }}>
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {!loading && shares.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}><Typography color="text.secondary">No shares yet</Typography></Box>
        ) : (
          <List disablePadding>
            {shares.map((share) => (
              <ShareRow
                key={share.id}
                share={share}
                onChange={(updated) => setShares((items) => items.map((item) => item.id === updated.id ? updated : item))}
              />
            ))}
          </List>
        )}
        {loading && <Box sx={{ display: "grid", placeItems: "center", p: 3 }}><CircularProgress size={28} /></Box>}
        {cursor && !loading && <Button onClick={() => load(cursor)} sx={{ m: 2 }}>Load more</Button>}
        <Divider />
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
