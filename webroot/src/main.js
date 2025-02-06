import * as KernelSU from "kernelsu";

// Global working variables
let workingFolder = null;      // e.g. "/data/local/tmp/adirf27042"
let currentPort = null;        // e.g. "27042"
let currentServerName = null;  // e.g. "frida-server" or a custom name like "rndserver"

// DOM elements
const toggleSwitch   = document.getElementById("fridaToggle");
const statusElement  = document.getElementById("fridaStatus");
const updateButton   = document.getElementById("updateFrida");
const debugElement   = document.getElementById("debugOutput");
const fridaNameInput = document.getElementById("fridaName");
const fridaPortInput = document.getElementById("fridaPort");

// Utility logging function
const log = (msg) => {
  debugElement.innerText += `\n${msg}`;
};

// Helper: Check if a file exists via KernelSU.exec
const checkFileExists = async (filePath) => {
  const { stdout } = await KernelSU.exec(
    `su -c "[ -f '${filePath}' ] && echo EXISTS || echo MISSING"`
  );
  return stdout.trim() === "EXISTS";
};

// Helper: Detect an existing working folder (adirf*) in /data/local/tmp
// Also detect the binary file name inside that folder.
const detectWorkingFolder = async () => {
  try {
    const { stdout } = await KernelSU.exec(
      `su -c "ls /data/local/tmp | grep '^adirf'"`
    );
    const folders = stdout.split("\n").map(f => f.trim()).filter(f => f);
    if (folders.length > 0) {
      // Use the first found folder, e.g. "adirf27041"
      const folderName = folders[0];
      workingFolder = `/data/local/tmp/${folderName}`;
      currentPort = folderName.replace(/^adirf/, "");
      
      // List the files inside the working folder:
      const { stdout: filesOut } = await KernelSU.exec(`su -c "ls '${workingFolder}'"`);
      const files = filesOut.split("\n").map(f => f.trim()).filter(f => f);
      currentServerName = files.length > 0 ? files[0] : "frida-server";
      
      // Update the input fields to reflect the detected configuration.
      fridaPortInput.value = currentPort;
      fridaNameInput.value = currentServerName;
      log(`Detected working folder: ${workingFolder} with server name: ${currentServerName}`);
      return true;
    }
  } catch (error) {
    log(`Error detecting working folder: ${error}`);
  }
  return false;
};

// Helper: Create (or update) the working folder using the input values.
// This folder will be named /data/local/tmp/adirf<port>
const createWorkingFolder = async () => {
  currentPort = fridaPortInput.value.trim() || "27042";
  currentServerName = fridaNameInput.value.trim() || "frida-server";
  const folderName = `adirf${currentPort}`;
  workingFolder = `/data/local/tmp/${folderName}`;
  await KernelSU.exec(`su -c "mkdir -p '${workingFolder}'"`);
  log(`Using working folder: ${workingFolder}`);
  return workingFolder;
};

// Helper: Move the frida binary from the current folder to a new one.
// (This is used when the port changes.)
const renameWorkingFolder = async (newFolder) => {
  if (!workingFolder) {
    await createWorkingFolder();
    return;
  }
  if (workingFolder !== newFolder) {
    log(`Port changed. Renaming working folder from ${workingFolder} to ${newFolder}...`);
    await KernelSU.exec(`su -c "mv '${workingFolder}' '${newFolder}'"`);
    workingFolder = newFolder;
    currentPort = newFolder.replace("/data/local/tmp/adirf", "");
    log(`Working folder renamed to ${workingFolder}`);
  }
};

// Helper: Rename the binary inside the working folder if the server name changes.
const renameServerBinary = async (newServerName) => {
  const oldBinaryPath = `${workingFolder}/${currentServerName}`;
  const newBinaryPath = `${workingFolder}/${newServerName}`;
  if (currentServerName !== newServerName) {
    log(`Renaming binary from ${oldBinaryPath} to ${newBinaryPath}...`);
    if (await checkFileExists(oldBinaryPath)) {
      await KernelSU.exec(`su -c "mv '${oldBinaryPath}' '${newBinaryPath}'"`);
      await KernelSU.exec(`su -c "chmod +x '${newBinaryPath}'"`);
      currentServerName = newServerName;
      log(`Binary renamed to ${newServerName}`);
    } else {
      log("Old binary not found; cannot rename binary.");
    }
  } else {
    log("Server name unchanged; no renaming needed.");
  }
};

// Helper: Fetch the latest Frida version from GitHub API
const fetchLatestFridaVersion = async () => {
  try {
    const response = await fetch("https://api.github.com/repos/frida/frida/releases/latest");
    const data = await response.json();
    return data.tag_name || null;
  } catch (error) {
    log(`❌ Error fetching latest Frida version: ${error}`);
    return null;
  }
};

// Helper: Download and install frida-server from GitHub.
// The file is downloaded to /storage/emulated/0/Download as "frida-server(.xz)"
const downloadAndInstallFrida = async (version, forceDownload = false) => {
  const downloadDir = "/storage/emulated/0/Download";
  const defaultBinaryName = "frida-server"; // downloaded file name in Downloads
  const downloadPath = `${downloadDir}/${defaultBinaryName}`;
  const downloadedXZPath = `${downloadPath}.xz`;
  // Ensure the download directory exists
  await KernelSU.exec(`su -c "mkdir -p '${downloadDir}'"`);
  if (forceDownload || !(await checkFileExists(downloadPath))) {
    log("⬇️ Downloading Frida server...");
    const downloadUrl = `https://github.com/frida/frida/releases/download/${version}/frida-server-${version}-android-arm64.xz`;
    await KernelSU.exec(`su -c "busybox wget --no-check-certificate -qO '${downloadedXZPath}' '${downloadUrl}'"`);
    const { stdout: status } = await KernelSU.exec(
      `su -c "[ -s '${downloadedXZPath}' ] && echo OK || echo FAIL"`
    );
    log(`Debug: Download file status: "${status.trim()}"`);
    if (status.trim() !== "OK") {
      throw new Error("Frida download failed!");
    }
    await KernelSU.exec(`su -c "busybox unxz '${downloadedXZPath}'"`);
    await KernelSU.exec(`su -c "chmod +x '${downloadPath}'"`);
    log("✅ Frida server downloaded and extracted.");
  }
  return downloadPath;
};

// Apply new configuration (rename or port change).
// This function renames the working folder and/or the binary using move (mv).
const applyConfiguration = async () => {
  if (toggleSwitch.checked) {
    alert("Please stop the server before changing configuration.");
    return;
  }
  const newPort = fridaPortInput.value.trim() || "27042";
  const newServerName = fridaNameInput.value.trim() || "frida-server";
  const newFolder = `/data/local/tmp/adirf${newPort}`;

  // Rename the working folder if the port has changed.
  await renameWorkingFolder(newFolder);

  // Rename the binary inside the working folder if the server name has changed.
  await renameServerBinary(newServerName);
};

// Initialize Frida:
// 1. Check for a working folder in /data/local/tmp (adirf*).
// 2. If none exists, create one based on the input fields.
// 3. Then, if a frida-server binary exists in the working folder, do nothing.
//    Otherwise, check if one exists in /Downloads and move it; if not, download it.
const initializeFrida = async () => {
  log("🔍 Initializing Frida...");
  const detected = await detectWorkingFolder();
  if (!detected) {
    await createWorkingFolder();
  }
  const binaryPath = `${workingFolder}/${(currentServerName || "frida-server")}`;
  if (await checkFileExists(binaryPath)) {
    log(`✅ Frida binary found in ${workingFolder}`);
    fridaNameInput.value = currentServerName;
    fridaPortInput.value = currentPort;
    return;
  }
  // If no binary in working folder, check Downloads.
  const downloadPath = "/storage/emulated/0/Download/frida-server";
  if (await checkFileExists(downloadPath)) {
    log(`📡 Found frida-server in Downloads. Moving it to ${workingFolder}...`);
    await KernelSU.exec(`su -c "mv '${downloadPath}' '${workingFolder}/frida-server'"`);
    await KernelSU.exec(`su -c "chmod +x '${workingFolder}/frida-server'"`);
    currentServerName = "frida-server";
    fridaNameInput.value = currentServerName;
    return;
  }
  // Otherwise, fetch and install the latest version.
  log("⬇️ Fetching latest Frida version...");
  const latestVersion = await fetchLatestFridaVersion();
  if (!latestVersion) {
    log("❌ Failed to get latest Frida version!");
    return;
  }
  log(`📡 Latest Frida Version: ${latestVersion}`);
  const downloadedPath = await downloadAndInstallFrida(latestVersion);
  await KernelSU.exec(`su -c "mv '${downloadedPath}' '${workingFolder}/frida-server'"`);
  await KernelSU.exec(`su -c "chmod +x '${workingFolder}/frida-server'"`);
  currentServerName = "frida-server";
  fridaNameInput.value = currentServerName;
};

// Check Frida status using ps -A and grep for the current server name.
const checkFridaStatus = async () => {
  const binaryName = currentServerName || "frida-server";
  try {
    const { stdout } = await KernelSU.exec(`su -c "ps -A | grep '${binaryName}'"`);
    log(`Debug: ps output: ${stdout}`);
    const isRunning = stdout && stdout.trim().length > 0;
    statusElement.innerText = isRunning ? "✅ Frida Running" : "❌ Frida Stopped";
    toggleSwitch.checked = isRunning;
    // Disable input fields when the server is running.
    fridaNameInput.disabled = isRunning;
    fridaPortInput.disabled = isRunning;
  } catch (error) {
    statusElement.innerText = "❌ Error checking Frida!";
    toggleSwitch.checked = false;
  }
};

// Toggle Frida on/off.
// If toggling on, start the server using the binary in the working folder.
// If toggling off, kill the server.
const toggleFrida = async () => {
  const port = fridaPortInput.value.trim() || "27042";
  const serverName = fridaNameInput.value.trim() || "frida-server";
  const newFolder = `/data/local/tmp/adirf${port}`;
  // Ensure the working folder is up-to-date if the port changed.
  if (workingFolder !== newFolder) {
    log(`Port changed. Renaming working folder to ${newFolder}...`);
    await renameWorkingFolder(newFolder);
  }
  const binaryPath = `${newFolder}/${serverName}`;
  try {
    if (toggleSwitch.checked) {
      // Start the server
      await KernelSU.exec(`su -c "${binaryPath} -D -l 0.0.0.0:${port} &"`);
      log("Started Frida server.");
    } else {
      // Stop the server (kill by matching the binary path)
      await KernelSU.exec(`su -c "pkill -f '${binaryPath}'"`);
      log("Stopped Frida server.");
    }
    // Allow a short delay for state to settle.
    await new Promise(resolve => setTimeout(resolve, 1500));
    await checkFridaStatus();
  } catch (error) {
    alert("❌ Failed to toggle Frida: " + error);
    toggleSwitch.checked = !toggleSwitch.checked;
  }
};

// Check Frida version and update UI.
const checkFridaVersion = async () => {
  const currentVersionElement = document.getElementById("currentVersion");
  const latestVersionElement  = document.getElementById("latestVersion");
  if (!workingFolder) {
    currentVersionElement.innerText = "Not Installed";
    return;
  }
  const binaryPath = `${workingFolder}/${(currentServerName || "frida-server")}`;
  try {
    const { stdout } = await KernelSU.exec(`su -c "${binaryPath} --version"`);
    currentVersionElement.innerText = stdout.trim() || "Unknown";
  } catch {
    currentVersionElement.innerText = "Not Installed";
  }
  const latestVersion = await fetchLatestFridaVersion();
  latestVersionElement.innerText = latestVersion || "Error Fetching Version";
};

// On page load, initialize and check status and version.
document.addEventListener("DOMContentLoaded", async () => {
  log("🟢 Module launched: initializing...");
  await initializeFrida();
  await checkFridaStatus();
  await checkFridaVersion();
});

// Attach event listeners.
toggleSwitch.addEventListener("change", toggleFrida);
document.getElementById("updateFrida").addEventListener("click", async () => {
  if (toggleSwitch.checked) {
    alert("Please stop the server before updating.");
    return;
  }
  const latestVersion = await fetchLatestFridaVersion();
  if (!latestVersion) {
    log("❌ Could not fetch latest Frida version.");
    return;
  }
  log(`⬇️ Updating Frida to ${latestVersion}...`);
  const downloadedPath = await downloadAndInstallFrida(latestVersion, true);
  await KernelSU.exec(`su -c "mv '${downloadedPath}' '${workingFolder}/frida-server'"`);
  await KernelSU.exec(`su -c "chmod +x '${workingFolder}/frida-server'"`);
  log(`✅ Frida updated to ${latestVersion}`);
  await checkFridaVersion();
});

fridaNameInput.addEventListener("blur", async () => {
    if (!toggleSwitch.checked) {
      await applyConfiguration();
    }
  });
  fridaPortInput.addEventListener("blur", async () => {
    if (!toggleSwitch.checked) {
      await applyConfiguration();
    }
  });
  
