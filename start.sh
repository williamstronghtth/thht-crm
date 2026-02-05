#!/bin/bash
# On Render, the filesystem is ephemeral - reimport data if DB doesn't exist
if [ ! -f crm.db ]; then
  echo "No database found, importing contacts..."
  node import.js
fi
node server.js
