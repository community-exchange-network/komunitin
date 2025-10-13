#!/bin/sh

# Generate config.js from config.template.js with environment variable substitution
echo "Generating runtime configuration..."

# Check if template exists
if [ ! -f "/usr/share/nginx/html/config.template.js" ]; then
  echo "Error: config.template.js not found!"
  exit 1
fi

# Use envsubst to replace environment variables in the template
envsubst < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js

# Verify the config was generated
if [ -f "/usr/share/nginx/html/config.js" ]; then
  echo "Runtime configuration generated successfully at /usr/share/nginx/html/config.js"
  
  # Show a preview of the generated config (first few lines)
  echo "Configuration first lines:"
  head -5 /usr/share/nginx/html/config.js
else
  echo "Error: Failed to generate config.js"
  exit 1
fi

echo "Configuration replacement completed."