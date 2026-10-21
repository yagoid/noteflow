# Maintainer: yagoid <yago.igle@gmail.com>
# Contributor: callysthenes
#
# !!! NOT WORKING / UNSUPPORTED — Arch users: use the AppImage from
# !!! https://github.com/yagoid/noteflow/releases/latest instead.
#
# Known problems (kept here for reference until someone can test a fix on Arch):
#   - package() copies only dist/, dist-electron/ and package.json, NOT node_modules,
#     so the installed app crashes at startup on require('js-yaml') and friends.
#   - It runs on the system `electron` package (whatever version Arch ships), while
#     NoteFlow targets Electron 35.
#   - NoteFlow uses native modules (better-sqlite3, onnxruntime-node, sqlite-vec) that
#     must be built against the exact Electron ABI they run on; nothing here rebuilds
#     them for the system electron.

pkgname=noteflow
pkgver=2.0.0
pkgrel=1
pkgdesc="Fast notes for software engineers - Local files, optional private GitHub sync. No telemetry."
arch=('x86_64')
url="https://github.com/yagoid/noteflow"
license=('GPL-3.0-or-later')
depends=('electron' 'xdg-utils')
makedepends=('npm' 'nodejs>=18' 'git')
optdepends=('git: for GitHub sync feature')
conflicts=("${pkgname}-bin" "${pkgname}-appimage")
source=("${pkgname}-${pkgver}.tar.gz::https://github.com/yagoid/${pkgname}/archive/refs/tags/v${pkgver}.tar.gz")
sha256sums=('SKIP') # Update with actual checksums after release

prepare() {
  cd "${srcdir}/${pkgname}-${pkgver}"
  # Install dependencies
  npm install
}

build() {
  cd "${srcdir}/${pkgname}-${pkgver}"
  # Build the app
  npm run build
}

package() {
  cd "${srcdir}/${pkgname}-${pkgver}"

  # Create directories
  install -d "${pkgdir}/usr/lib/${pkgname}"
  install -d "${pkgdir}/usr/bin"
  install -d "${pkgdir}/usr/share/applications"
  install -d "${pkgdir}/usr/share/icons/hicolor/512x512/apps"
  install -d "${pkgdir}/usr/share/licenses/${pkgname}"

  # Copy application files
  cp -r dist "${pkgdir}/usr/lib/${pkgname}/"
  cp -r dist-electron "${pkgdir}/usr/lib/${pkgname}/"
  install -Dm644 package.json "${pkgdir}/usr/lib/${pkgname}/package.json"

  # Copy CLI tool
  install -d "${pkgdir}/usr/lib/${pkgname}/cli"
  install -Dm755 cli/noteflow.js "${pkgdir}/usr/lib/${pkgname}/cli/noteflow.js"

  # Create GUI wrapper
  cat > "${pkgdir}/usr/bin/${pkgname}" << EOF
#!/bin/bash
export NOTEFLOW_NATIVE=1
export ELECTRON_IS_DEV=0
exec electron /usr/lib/${pkgname} "\$@"
EOF
  chmod +x "${pkgdir}/usr/bin/${pkgname}"

  # Link CLI
  ln -s "/usr/lib/${pkgname}/cli/noteflow.js" "${pkgdir}/usr/bin/${pkgname}-cli"

  # Copy icon
  install -Dm644 public/icon.png "${pkgdir}/usr/share/icons/hicolor/512x512/apps/${pkgname}.png"

  # Copy desktop file
  cat > "${pkgdir}/usr/share/applications/${pkgname}.desktop" << EOF
[Desktop Entry]
Name=NoteFlow
Comment=Fast notes for software engineers
Exec=/usr/bin/${pkgname} %U
Icon=${pkgname}
Terminal=false
Type=Application
Categories=Utility;TextEditor;
Keywords=notes;markdown;text;
EOF

  # Copy license
  install -Dm644 LICENSE "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE"
}
