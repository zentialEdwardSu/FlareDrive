# FlareDrive

Cloudflare R2 storage manager with a Pages frontend and Functions WebDAV backend.
R2 stores file bodies while Cloudflare D1 stores the file index and runtime data.
Cloudflare R2 includes a free 10 GB storage tier, and Pages Functions include a free
serverless request allowance. See the official Cloudflare pricing pages for current
limits and costs.

## Features

- Upload large files through the web interface
- Create folders
- Search files
- Image, video, and PDF thumbnails
- WebDAV endpoint for third-party clients
- Drag and drop upload
- Passkey login for the web interface
- Managed single-file share links with expiry and revocation

## Installation

Before starting, make sure that:

- You have created a Cloudflare account
- Your payment method is added
- R2 is activated and at least one bucket is created
- A D1 database is created for FlareDrive runtime data

Steps:

1. Fork this project and connect your fork with Cloudflare Pages.
   - Select the `Docusaurus` framework preset.
   - Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`.
   - Optional: set `WEBDAV_2FA_SECRET` to a Base32 TOTP seed. When configured, web password login requires both the password and a current TOTP code.
   - Optional: set `WEBDAV_2FA_WINDOW` to tolerate clock drift. The default is `0`.
   - Optional: set `WEBDAV_TOTP_DIRECT_LOGIN=1` to allow TOTP-only web login. This is disabled by default.
   - Optional: set `AUTH_SESSION_SECRET` to sign web login cookies. If omitted, `WEBDAV_PASSWORD` is used.
   - Optional: set `AUTH_SESSION_SECONDS` to control web login persistence. The default is `2592000` seconds.
   - Optional: set `DRIVE_ID` to a stable identifier when the same `BUCKET` is served from more than one domain.
2. Apply the D1 schema from [`migrations/0001_runtime.sql`](migrations/0001_runtime.sql). With Wrangler, run:

   ```bash
   npx wrangler d1 migrations apply <database-name> --remote
   ```

3. After the initial deployment, add these Cloudflare Pages bindings:
   - Bind the R2 bucket to `BUCKET`.
   - Bind the D1 database to `DB`.
4. Retry deployment from the Cloudflare Pages `Deployments` page to apply the bindings and variables.
5. Sign in, open the browser developer console on the FlareDrive page, and build the initial D1 file index once:

   ```js
   await fetch("/api/index/rebuild", { method: "POST" }).then((response) => response.json())
   ```

   This also migrates existing Passkeys and managed share records from FlareDrive's old internal R2 objects. Normal uploads, copies, moves, and deletes keep the D1 index current afterward. `GET /api/index/rebuild` reports the current index count and last rebuild.
6. Optional: add a custom domain.

You can also deploy this project using Wrangler CLI:

```bash
npm run build
npx wrangler pages deploy build
```

## WebDAV Endpoint

Use a WebDAV client such as Cx File Explorer, BD File Manager, Cyberduck, Mountain Duck, or the client built into your operating system.

Endpoint:

```text
https://<your-domain.com>/webdav
```

WebDAV clients authenticate with `WEBDAV_USERNAME` and `WEBDAV_PASSWORD` using Basic authentication. TOTP is not required for normal WebDAV client access, because many third-party clients do not support multi-factor prompts.

The standard WebDAV protocol path does not support large uploads above the Cloudflare Workers request body limit. Use the web interface for large files; it uses multipart uploads.

## Web Login

The web interface supports:

- Username and password
- Username, password, and TOTP when `WEBDAV_2FA_SECRET` is configured
- Optional TOTP-only login when `WEBDAV_TOTP_DIRECT_LOGIN=1`
- Passkey login after registering a passkey from the menu

Passkeys require user verification. A successful web login creates a persistent session cookie controlled by `AUTH_SESSION_SECONDS`.

Use Passkey management in the header to add, rename, or remove credentials and review when they were created and last used. Removing a credential from FlareDrive does not remove the corresponding entry from the device or password manager.

## Sharing

Public read access is not enabled globally. The app supports explicit single-file share links instead.

Use the web interface share action on one selected file to create a link containing a random share token. New links expire after seven days by default; the share dialog also offers one-day, 30-day, custom, and permanent expiry options. The Share management screen can copy links, change an active link's expiry, and revoke access.

The resulting URL uses `?share=<token>` and allows unauthenticated `GET` or `HEAD` access to that file only. Folders, directory listings, internal objects, writes, deletes, and moves are not exposed through share links. Renaming, moving, deleting, or overwriting a file invalidates its link. A replacement share receives a new token. Links created by versions of FlareDrive that stored `shareToken` in file metadata are no longer accepted.

Share records are stored in D1. Creating a link reads the D1 file index only and does not read, copy, or rewrite the shared file.

## Runtime Data and File Index

D1 stores Passkeys, WebAuthn challenges, managed shares, and the R2 object metadata index. Every record includes a drive ID. By default it is derived from the request hostname, so installations that bind different R2 buckets by subdomain retain separate indexes in one database. Set `DRIVE_ID` when one bucket is reachable through multiple domains so every domain uses the same D1 partition. Directory listings use D1 and file downloads continue to read the file body from R2.

If files are changed directly through the R2 API or dashboard, run the authenticated `POST /api/index/rebuild` endpoint again. Changes made through FlareDrive and its WebDAV endpoint update D1 automatically.

## Security Notes

- Dangerous inline content types such as HTML, SVG, JavaScript, and XML are served as downloads with `X-Content-Type-Options: nosniff`.
- WebDAV `PROPFIND` XML values are escaped before being returned to clients.
- Deleting or moving sensitive internal objects requires a valid `X-FlareDrive-TOTP` header when `WEBDAV_2FA_SECRET` is configured.
- Thumbnail images use lazy loading and private cache headers. The thumbnail service worker does not serve cached private thumbnails as an offline fallback.
- `AUTH_SESSION_SECRET` is recommended for production deployments even though the app can fall back to `WEBDAV_PASSWORD`.

## Acknowledgments

WebDAV related code is based on the
[r2-webdav](https://github.com/abersheeran/r2-webdav) project by
[abersheeran](https://github.com/abersheeran).
