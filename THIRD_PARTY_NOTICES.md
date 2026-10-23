# Third-party software

SeminarComment's original source code is licensed under the MIT License in `LICENSE`.
Third-party software retains its own copyright and license terms.

| Component | License | Project |
| --- | --- | --- |
| Electron | MIT and bundled Chromium/Node.js notices | https://github.com/electron/electron |
| qrcode and its dependencies | See bundled npm license files | https://github.com/soldair/node-qrcode |
| ws | MIT | https://github.com/websockets/ws |
| cloudflared | Apache-2.0; see bundled LICENSE | https://github.com/cloudflare/cloudflared |

Release applications include `Resources/licenses` on macOS and `resources/licenses`
on Windows, containing the application's MIT License, Electron's license and
Chromium notices, and license files from installed production npm dependencies.
The cloudflared license is also included under `tunnel/LICENSE`.

`pnpm prepare:licenses` collects notices from the exact installed runtime and npm
dependencies before packaging. The development/build dependencies listed in
`pnpm-lock.yaml` have their own license files in their respective packages.
