#!/usr/bin/env bash
# Wrapper pour lancer le sweep Playwright sur la preview Vercel.
# Lit .env local (gitignored) pour les creds.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .audit-ui-ux/.env ]; then
  echo "ERREUR : .audit-ui-ux/.env introuvable."
  echo "→ cp .audit-ui-ux/.env.example .audit-ui-ux/.env"
  echo "→ remplir AUDIT_PASSWORD"
  exit 1
fi

# Charge les vars du .env
set -a
source .audit-ui-ux/.env
set +a

if [ -z "${AUDIT_PASSWORD:-}" ]; then
  echo "ERREUR : AUDIT_PASSWORD vide dans .audit-ui-ux/.env"
  exit 1
fi

# Install Playwright + chromium si manquant
if ! node -e "require('@playwright/test')" 2>/dev/null; then
  echo "→ Installation @playwright/test + chromium (une fois, ~2 min)..."
  npm install --save-dev @playwright/test
  npx playwright install chromium
fi

echo "→ Lancement sweep sur $AUDIT_BASE_URL avec $AUDIT_EMAIL"
npx tsx .audit-ui-ux/sweep.ts
