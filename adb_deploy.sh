#!/bin/bash

# Define paths
LOCAL_DIST="dist"
TMP_DIR="/data/local/tmp/dist"
MODULE_DIR="/data/adb/modules/kernelsu-frida"
WEBROOT="$MODULE_DIR/webroot"
MODULE_PROP="module.prop"

echo "🚀 Starting deployment..."

# Step 1: Build the project
echo "🛠️ Building project..."
yarn build || { echo "❌ Build failed!"; exit 1; }

# Step 2: Push dist/ to temporary location on device
echo "📡 Pushing dist/ to device..."
adb push "$LOCAL_DIST" /data/local/tmp/ || { echo "❌ ADB push failed!"; exit 1; }

# Step 3: Ensure the module directory exists (WITH ROOT PERMISSION)
echo "📂 Checking if $MODULE_DIR exists..."
adb shell su -c "mkdir -p $WEBROOT" || { echo "❌ Failed to create $MODULE_DIR!"; exit 1; }

# Step 4: Move files with root permissions
echo "📂 Moving web files to $WEBROOT..."
adb shell su -c "mv /data/local/tmp/dist/* $WEBROOT/" || { echo "❌ Move failed!"; exit 1; }

# Step 5: Push module.prop to register in KernelSU Manager
echo "📡 Registering module in KernelSU..."
adb push "$MODULE_PROP" /data/local/tmp/ || { echo "❌ Failed to push module.prop"; exit 1; }
adb shell su -c "mv /data/local/tmp/module.prop $MODULE_DIR/" || { echo "❌ Failed to move module.prop"; exit 1; }

# Step 6: Fix permissions
echo "🔧 Setting permissions..."
adb shell su -c "chmod -R 755 $MODULE_DIR" || { echo "❌ Permission update failed!"; exit 1; }
adb shell su -c "chmod 644 $MODULE_DIR/module.prop"

# Step 7: Clean up temporary folder
echo "🧹 Cleaning up..."
adb shell su -c "rm -rf $TMP_DIR"
adb shell su -c "rm -rf /data/local/tmp/module.prop"

echo "✅ Deployment successful!"
