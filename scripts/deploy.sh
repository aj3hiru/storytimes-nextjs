#!/usr/bin/env bash
# Zero-downtime deploy on the server: build beside the live site, then swap.
# The live site keeps running from .next until the new build is ready; old
# CSS/JS files are kept so pages already open in browsers keep working.
# Never deletes uploads, backups or database data.
#   bash scripts/deploy.sh            (after git pull + any prisma db push)
set -euo pipefail
cd "$(dirname "$0")/.."
APP=fable
PORT=3004
npx prisma generate > /dev/null 2>&1
rm -rf .next-build
if ! NEXT_DIST_DIR=.next-build NODE_OPTIONS=--max-old-space-size=1536 npx next build > /tmp/fable-build.log 2>&1; then
  tail -30 /tmp/fable-build.log; echo "BUILD FAILED — live site untouched"; rm -rf .next-build; exit 1
fi
grep -E "Compiled|Generating static" /tmp/fable-build.log | tail -2 || true
if [ -d .next/static ]; then cp -rn .next/static/. .next-build/static/ 2>/dev/null || true; fi
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-build .next
pm2 restart "$APP" --update-env > /dev/null
ok=""
for i in $(seq 1 20); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" || true)
  if [ "$code" = "200" ]; then ok=1; break; fi
done
css=$(curl -s "http://127.0.0.1:$PORT/" | grep -o '/_next/static/[^"]*\.css' | head -1 || true)
csscode=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT${css}" || true)
echo "home ${code:-?} · css $csscode"
if [ -z "$ok" ] || [ "$csscode" != "200" ]; then
  echo "Site check failed — rolling back"; rm -rf .next; mv .next-old .next; pm2 restart "$APP" --update-env > /dev/null; exit 1
fi
echo "DEPLOYED"
