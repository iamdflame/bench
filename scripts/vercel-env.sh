#!/usr/bin/env bash
# Copies the server-side keys this deployment needs from .env to Vercel
# production, without printing a value. Run it once after adding a key.
#
#   bash scripts/vercel-env.sh AGENT_A_KEY AGENT_B_KEY ADJUDICATOR_KEY SESSION_SECRET
#
# The keeper (POST /api/keeper/bid) answers 503 on the live site until
# AGENT_A_KEY is present; sessions cannot be executed or revoked from Vercel
# until SESSION_SECRET is.
set -euo pipefail
for k in "$@"; do
  v=$(grep -E "^${k}=" .env .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r')
  if [ -z "$v" ]; then echo "$k: not set locally, skipped"; continue; fi
  if vercel env ls production 2>/dev/null | awk '{print $1}' | grep -qx "$k"; then
    echo "$k: already on Vercel production"
  else
    printf '%s' "$v" | vercel env add "$k" production >/dev/null && echo "$k: added"
  fi
done
