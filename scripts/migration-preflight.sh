#!/usr/bin/env bash
# migration-preflight — Audit d'une migration SQL avant apply en prod.
#
# Usage : ./scripts/migration-preflight.sh supabase/migrations/038_xxx.sql
#
# Détecte les patterns à risque et affiche un rapport. Ne bloque rien — c'est
# une checklist qui aide à se poser les bonnes questions avant de pousser
# une migration sensible en prod.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <migration-file.sql>"
  exit 1
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "❌ Fichier introuvable : $FILE"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Audit migration : $FILE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Header check
if ! head -1 "$FILE" | grep -qE '^--'; then
  echo "⚠️  Pas de commentaire de description en tête. Ajouter un header :"
  echo "    -- description : que fait cette migration ? pourquoi ?"
  echo ""
fi

# Patterns destructifs
echo "── Détection actions destructives ──"
RISKY=0
if grep -nE 'DROP\s+TABLE' "$FILE" >/dev/null 2>&1; then
  echo "🔴 DROP TABLE détecté :"
  grep -nE 'DROP\s+TABLE' "$FILE"
  RISKY=$((RISKY+1))
fi
if grep -nE 'TRUNCATE' "$FILE" >/dev/null 2>&1; then
  echo "🔴 TRUNCATE détecté :"
  grep -nE 'TRUNCATE' "$FILE"
  RISKY=$((RISKY+1))
fi
if grep -nE 'DELETE\s+FROM\s+[a-zA-Z_]+\s*;' "$FILE" >/dev/null 2>&1; then
  echo "🟡 DELETE sans WHERE détecté :"
  grep -nE 'DELETE\s+FROM\s+[a-zA-Z_]+\s*;' "$FILE"
  RISKY=$((RISKY+1))
fi
if grep -nE 'ALTER\s+TABLE.*DROP\s+COLUMN' "$FILE" >/dev/null 2>&1; then
  echo "🟡 ALTER TABLE DROP COLUMN détecté :"
  grep -nE 'ALTER\s+TABLE.*DROP\s+COLUMN' "$FILE"
  RISKY=$((RISKY+1))
fi
[ $RISKY -eq 0 ] && echo "✓ Aucune action destructive détectée"
echo ""

# Patterns RLS
echo "── Détection changements RLS ──"
if grep -nE '(CREATE|DROP)\s+POLICY' "$FILE" >/dev/null 2>&1; then
  echo "🔵 Modifications RLS détectées :"
  grep -nE '(CREATE|DROP)\s+POLICY' "$FILE"
  echo ""
  echo "   ⚠️  Test obligatoire :"
  echo "      1. Compter ce qu'un user voit AVANT le changement (par rôle)"
  echo "      2. Appliquer dans une transaction BEGIN..ROLLBACK pour valider"
  echo "      3. Comparer le count APRÈS — vérifier zéro régression"
fi
echo ""

# Statements en mode "fire-and-forget" sans transaction
if ! grep -qE '(BEGIN|COMMIT|ROLLBACK)' "$FILE"; then
  echo "💡 Astuce : enrober les UPDATE/DELETE multi-tables dans BEGIN..COMMIT"
  echo "   pour pouvoir ROLLBACK en cas d'erreur."
  echo ""
fi

# Statistiques
LINES=$(wc -l < "$FILE")
STATEMENTS=$(grep -cE ';' "$FILE" || echo 0)
echo "── Stats ──"
echo "  Lignes : $LINES"
echo "  Statements (env.) : $STATEMENTS"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Pre-flight terminé. Avant d'appliquer en prod :"
echo "     1. PITR activé sur le projet (vérifier dans Supabase Studio)"
echo "     2. Effectuer les counts avant/après documentés dans la PR"
echo "     3. \"OK prod\" explicite de Kevin"
echo "═══════════════════════════════════════════════════════════════"
