#!/bin/bash
# Parche rápido para DevHub .deb instalado: rutas zip/PTY que el wrapper esperaba mal.
# Requiere sudo. Ejecutar: sudo bash scripts/patch-installed-devhub.sh

set -euo pipefail

PREFIX="/usr/lib/DevHub"
ZIP="$PREFIX/standalone.zip"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecutá con sudo: sudo bash $0"
  exit 1
fi

if [ ! -f "$ZIP" ]; then
  echo "No se encontró $ZIP — ¿DevHub está instalado?"
  exit 1
fi

mkdir -p "$PREFIX/resources" "$PREFIX/_up_"
ln -sfn "$ZIP" "$PREFIX/resources/standalone.zip"
ln -sfn "$PREFIX/sidecar-backend" "$PREFIX/_up_/sidecar-backend"

if [ -f "$(dirname "$0")/../packaging/linux/devhub-server" ]; then
  install -m 755 \
    "$(dirname "$0")/../packaging/linux/devhub-server" \
    /usr/bin/devhub-server
  echo "Wrapper devhub-server actualizado."
elif [ -f "$(dirname "$0")/../src-tauri/binaries/devhub-server-x86_64-unknown-linux-gnu" ]; then
  install -m 755 \
    "$(dirname "$0")/../src-tauri/binaries/devhub-server-x86_64-unknown-linux-gnu" \
    /usr/bin/devhub-server
  echo "Wrapper devhub-server actualizado."
fi

# Warm-up para el usuario que corre el script (no solo SUDO_USER de dpkg)
TARGET_USER="${SUDO_USER:-${USER:-}}"
if [ -n "$TARGET_USER" ] && [ "$TARGET_USER" != "root" ]; then
  user_home=$(getent passwd "$TARGET_USER" | cut -d: -f6)
  target_dir="$user_home/.devhub/standalone"
  if [ -n "$user_home" ]; then
    echo "Re-extrayendo standalone para $TARGET_USER..."
    sudo -u "$TARGET_USER" bash -c "
      set -e
      rm -rf '$target_dir'
      mkdir -p '$target_dir'
      unzip -q '$ZIP' -d '$target_dir'
      stat -c %Y '$ZIP' > '$user_home/.devhub/sidecar-build-id.txt'
    "
  fi
fi

echo "Listo. Cerrá DevHub y volvé a abrirlo."
