# FlareDrive

Cloudflare R2 storage manager with Pages and Workers. Free 10 GB storage.
Free serverless backend with a limit of 100,000 invocation requests per day.
[More about pricing](https://developers.cloudflare.com/r2/platform/pricing/)

## Features

- Upload large files
- Create folders
- Search files
- Image/video/PDF thumbnails
- WebDAV endpoint
- Drag and drop upload

## Usage

### Installation

Before starting, you should make sure that

- you have created a [Cloudflare](https://dash.cloudflare.com/) account
- your payment method is added
- R2 service is activated and at least one bucket is created

Steps:

1. Fork this project and connect your fork with Cloudflare Pages
   - Select `Docusaurus` framework preset
   - Set `WEBDAV_USERNAME` and `WEBDAV_PASSWORD`
   - (Optional) Set `WEBDAV_2FA_SECRET` (Base32 TOTP seed) to allow 6-digit PIN sign-in on the web login page; adjust `WEBDAV_2FA_WINDOW` to tolerate clock drift.
   - (Optional) Set `AUTH_SESSION_SECRET` to sign web login cookies. If omitted, `WEBDAV_PASSWORD` is used.
   - (Optional) Set `AUTH_SESSION_SECONDS` to control web login persistence. The default is `2592000` seconds.
   - (Optional) Set `WEBDAV_PUBLIC_READ` to `1` to enable public read
2. After initial deployment, bind your R2 bucket to `BUCKET` variable
3. Retry deployment in `Deployments` page to apply the changes
4. (Optional) Add a custom domain

You can also deploy this project using Wrangler CLI:

```bash
npm run build
npx wrangler pages deploy build
```

### WebDAV endpoint

You can use any client (such as [Cx File Explorer](https://play.google.com/store/apps/details?id=com.cxinventor.file.explorer), [BD File Manager](https://play.google.com/store/apps/details?id=com.liuzho.file.explorer))
that supports the WebDAV protocol to access your files.
Fill the endpoint URL as `https://<your-domain.com>/webdav` and use the username and password you set. WebDAV clients use account/password Basic authentication only.

### Web login

The web interface supports account/password login, optional TOTP login, and passkey quick login. Sign in with account/password first, then open the menu and choose `Add passkey`. Future browser logins can use `Sign in with passkey`. A successful password, TOTP, or passkey login creates a persistent web session cookie controlled by `AUTH_SESSION_SECONDS`.

However, the standard WebDAV protocol does not support large file (≥128MB) uploads due to the limitation of Cloudflare Workers.
You must upload large files through the web interface which supports chunked uploads.

## Acknowledgments

WebDAV related code is based on [r2-webdav](
  https://github.com/abersheeran/r2-webdav
) project by [abersheeran](
  https://github.com/abersheeran
).
