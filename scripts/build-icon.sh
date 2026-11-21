#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/kitty.iconset
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" assets/kitty-app.png --out "assets/kitty.iconset/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" assets/kitty-app.png --out "assets/kitty.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns assets/kitty.iconset -o assets/kitty.icns
echo '已生成 assets/kitty.icns'
