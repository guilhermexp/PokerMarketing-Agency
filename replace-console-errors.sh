#!/bin/bash

# Replace console.error patterns in dev-api.mjs and index.mjs

FILES=("./server/dev-api.mjs" "./server/index.mjs")

for FILE in "${FILES[@]}"; do
  echo "Processing $FILE..."
  
  # Create a backup
  cp "$FILE" "$FILE.backup"
  
  # Apply replacements using sed (macOS compatible)
  
  # Pattern 1: console.error with string and error object
  # console.error("msg", error) -> logger.error({ err: error }, "msg")
  sed -i '' 's/console\.error(\([^,]*\), \(error[^)]*\))/logger.error({ err: \2 }, \1)/g' "$FILE"
  
  # Pattern 2: console.error with multiple arguments (need manual review)
  # Will be handled manually
  
done

echo "Done. Backups saved with .backup extension"
