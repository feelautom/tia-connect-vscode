#!/bin/bash
# Build, package, and install the extension in one shot
# Usage: ./deploy.sh [version]
# Example: ./deploy.sh 0.3.1
set -e

cd "$(dirname "$0")"

# Bump version if provided
if [ -n "$1" ]; then
    echo "=== Bumping version to $1 ==="
    npm version "$1" --no-git-tag-version
fi

VERSION=$(node -p "require('./package.json').version")
echo "=== Version: $VERSION ==="

echo "=== Building ==="
npm run build

echo "=== Packaging VSIX ==="
npx @vscode/vsce package --no-git-tag-version

VSIX="tia-connect-vscode-${VERSION}.vsix"
echo "=== Installing $VSIX ==="
code --install-extension "$VSIX" --force

echo "=== Done! Reload VS Code window (Ctrl+Shift+P > Reload Window) ==="
