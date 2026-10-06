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
if [ ! -f .next-build/BUILD_ID ]; then
  echo "Build folder has no BUILD_ID — live site untouched"; ls .next-build | head; exit 1
fi
if [ -d .next/static ]; then cp -rn .next/static/. .next-build/static/ 2>/dev/null || true; fi
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-build .next
pm2 restart "$APP" --update-env > /dev/null
ok=""
for i in $(seq 1 45); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" || true)
  if [ "$code" = "200" ]; then ok=1; break; fi
done
page=$(curl -s "http://127.0.0.1:$PORT/" || true)
css=$(echo "$page" | grep -o '/_next/static/[^"]*\.css' | head -1 || true)
if [ -n "$css" ]; then
  csscode=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT${css}" || true)
elif echo "$page" | grep -q "<style"; then
  csscode=200 # CSS is inlined into the HTML (experimental.inlineCss)
else
  csscode=000
fi
echo "home ${code:-?} · css $csscode"
if [ -z "$ok" ] || [ "$csscode" != "200" ]; then
  echo "Site check failed — rolling back"; ls .next | head -5; ls .next/BUILD_ID 2>&1; tail -5 ~/.pm2/logs/${APP}-error.log
  rm -rf .next-failed; mv .next .next-failed; mv .next-old .next; pm2 restart "$APP" --update-env > /dev/null; exit 1
fi
echo "DEPLOYED"
# Warm the page cache in the background: open every post once on the server
# itself, so no visitor ever waits for a page to be built.
(
  sleep 5
  for map in $(curl -s "http://127.0.0.1:$PORT/sitemap.xml" | grep -o '<loc>[^<]*sitemap-posts-[0-9]*\.xml</loc>' | sed 's/<[^>]*>//g'); do
    curl -s "http://127.0.0.1:$PORT/$(echo "$map" | sed 's#^https\?://[^/]*/##')" | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g'
  done | sed "s#^https\?://[^/]*#http://127.0.0.1:$PORT#" | xargs -P 2 -n 1 curl -s -o /dev/null
  echo "cache warmed $(date)" >> /tmp/fable-warm.log
) > /dev/null 2>&1 &
