#!/bin/bash

# Console Logger - Central Logging Script
# This ensures all logs go to the central directory

export CONSOLE_LOG_DIR="/Users/barryvelasquez/logs"
console-logger "$@"
