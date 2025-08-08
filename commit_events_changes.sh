#!/bin/bash

# Script to commit events.json changes to git repository

# Get the absolute path to the script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Get the repository root (script is in the root)
REPO_ROOT="$SCRIPT_DIR"

# Change to the repository root directory
cd "$REPO_ROOT"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository at $REPO_ROOT"
    exit 1
fi

# Check if events.json has been modified
if git diff --quiet docs/events.json; then
   echo "No changes detected in events.json"
   exit 0
fi

# Sanity checks for events.json
EVENTS_FILE="docs/events.json"

# 1. Check if file is empty
if [ ! -s "$EVENTS_FILE" ]; then
    echo "Error: events.json is empty"
    exit 1
fi

# 2. Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed. Please install jq to validate JSON."
    exit 1
fi

# 3. Validate JSON format
if ! jq empty "$EVENTS_FILE" 2>/dev/null; then
    echo "Error: events.json contains invalid JSON"
    exit 1
fi

# 4. Check if it's an array and has at least one event
if ! jq -e 'type == "array" and length > 0' "$EVENTS_FILE" >/dev/null 2>&1; then
    echo "Error: events.json must be an array with at least one event"
    exit 1
fi

# 5. Validate each event has required fields
if ! jq -e 'all(.[] | has("id") and has("type") and has("start_time") and has("end_time") and has("recurring") and has("recurrence_type"))' "$EVENTS_FILE" >/dev/null 2>&1; then
    echo "Error: All events must have required fields: id, type, start_time, end_time, recurring, recurrence_type"
    exit 1
fi

# 6. Validate that start_time is before end_time for all events
if ! jq -e 'all(.[] | .start_time < .end_time)' "$EVENTS_FILE" >/dev/null 2>&1; then
    echo "Error: All events must have start_time before end_time"
    exit 1
fi

echo "All sanity checks passed. Proceeding with commit..."

# Stage the changes
git add docs/events.json

# Create commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "auto: update events.json - $TIMESTAMP"

# Push the changes to the remote repository
git push

echo "Successfully committed changes to events.json at $TIMESTAMP" 