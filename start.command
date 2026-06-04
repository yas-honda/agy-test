#!/bin/bash
# Aegis Vanguard Instant Startup Script
# Double click to execute or run from terminal

# Navigate to the script's directory
cd "$(dirname "$0")"

echo "=================================================="
echo " Starting Aegis Vanguard Game Server..."
echo "=================================================="

# Start server in background
npm start &
SERVER_PID=$!

# Wait 2 seconds for server to start
sleep 2

# Open default browser
if [ "$(uname)" == "Darwin" ]; then
    open "http://localhost:3000"
elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
    xdg-open "http://localhost:3000" || echo "Please open http://localhost:3000 manually"
elif [ "$(expr substr $(uname -s) 1 10)" == "MINGW32_NT" ] || [ "$(expr substr $(uname -s) 1 10)" == "MINGW64_NT" ]; then
    start "http://localhost:3000"
fi

# Wait for server process to end (so command terminal stays open)
wait $SERVER_PID
