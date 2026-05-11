# FlareDrive

Cloudflare R2 storage manager with a Pages frontend and Functions WebDAV backend.
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
- Explicit single-file share links

## Installation

Before starting, make sure that:

- You have created a Cloudflare account
- Your payment method is added
- R2 is activated and at least one bucket is created

Steps:

1. Fork this project and connect your fork with Cloudflare Pages.
   - Select the `Docusaurus` framework preset.
   - Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`.
   - Optional: set `WEBDAV_2FA_SECRET` to a Base32 TOTP seed. When configured, web password login requires both the password and a current TOTP code.
   - Optional: set `WEBDAV_2FA_WINDOW` to tolerate clock drift. The default is `0`.
   - Optional: set `WEBDAV_TOTP_DIRECT_LOGIN=1` to allow TOTP-only web login. This is disabled by default.
   - Optional: set `AUTH_SESSION_SECRET` to sign web login cookies. If omitted, `WEBDAV_PASSWORD` is used.
   - Optional: set `AUTH_SESSION_SECONDS` to control web login persistence. The default is `2592000` seconds.
2. After the initial deployment, bind your R2 bucket to the `BUCKET` variable.
3. Retry deployment from the Cloudflare Pages `Deployments` page to apply the binding and variables.
4. Optional: add a custom domain.

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

## Sharing

Public read access is not enabled globally. The app supports explicit single-file share links instead.

Use the web interface share action on one selected file to create a link containing a random share token. The resulting URL uses `?share=<token>` and allows unauthenticated `GET` or `HEAD` access to that file only. Folders, directory listings, internal objects, writes, deletes, and moves are not exposed through share links.

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
