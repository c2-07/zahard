#!/bin/sh
set -e
trap 'kill %1 %2' EXIT

export DB_PATH="../data/app.db"
mkdir -p ../data

cd astro && npm run dev &
cd api && uv run python main.py &
wait
