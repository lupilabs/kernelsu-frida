import * as KernelSU from "kernelsu";

// ✅ Select elements
const toggleSwitch = document.getElementById("fridaToggle");
const statusElement = document.getElementById("fridaStatus");
const updateButton = document.getElementById("updateFrida");
const debugElement = document.getElementById("debugOutput");

// ✅ Utility: Log to WebView
const log = (msg) => {
    debugElement.innerText += `\n${msg}`;
};

// ✅ Helper: Check if a file exists using KernelSU.exec
const checkFileExists = async (filePath) => {
    const { stdout } = await KernelSU.exec(`[ -f ${filePath} ] && echo "EXISTS" || echo "MISSING"`);
    return stdout.trim() === "EXISTS";
};

// ✅ Helper: Fetch the latest Frida version from GitHub API
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

// ✅ Helper: Download and install Frida server
const downloadAndInstallFrida = async (version, forceDownload = false) => {
    const downloadDir = "/storage/emulated/0/Download";
    const tmpDir = "/data/local/tmp";
    const binaryName = "frida-server";
    const downloadPath = `${downloadDir}/${binaryName}`;
    const fridaPath = `${tmpDir}/${binaryName}`;
    const downloadUrl = `https://github.com/frida/frida/releases/download/${version}/frida-server-${version}-android-arm64.xz`;

    // Ensure the download directory exists
    await KernelSU.exec(`mkdir -p ${downloadDir}`);

    // Download if forced or if file isn't already in the Download directory
    if (forceDownload || !(await checkFileExists(downloadPath))) {
        log("⬇️ Downloading Frida server...");
        // Download the file to Download directory as .xz
        await KernelSU.exec(`su -c busybox wget --no-check-certificate -qO ${downloadPath}.xz "${downloadUrl}"`);

        // Check if the file exists and is non-empty.
        // If you suspect the size check is causing issues, you might try "-f" instead of "-s".
        const { stdout: status } = await KernelSU.exec(`su -c [ -s ${downloadPath}.xz ] && echo "OK" || echo "FAIL"`);
        log(`Debug: Download file status check output: "${status.trim()}"`);
        if (status.trim() !== "OK") {
            throw new Error("Frida download failed!");
        }
        // Decompress the downloaded file and set it as executable
        await KernelSU.exec(`su -c xz -d ${downloadPath}.xz`);
        await KernelSU.exec(`su -c chmod +x ${downloadPath}`);
        log("✅ Frida server downloaded and extracted.");
    }
    // Copy to /data/local/tmp and set permissions
    await KernelSU.exec(`su -c cp -f ${downloadPath} ${fridaPath}`);
    await KernelSU.exec(`su -c chmod +x ${fridaPath}`);
    log("✅ Frida installed to /data/local/tmp.");
};


// ✅ Check if Frida is running
const checkFridaStatus = async () => {
    try {
        const { stdout } = await KernelSU.exec("ps -A | grep frida-server");
        const isRunning = !!stdout && stdout.trim().length > 0;
        statusElement.innerText = isRunning ? "✅ Frida Running" : "❌ Frida Stopped";
        toggleSwitch.checked = isRunning;
    } catch {
        statusElement.innerText = "❌ Error checking Frida!";
        toggleSwitch.checked = false;
    }
};

// ✅ Toggle Frida On/Off
const toggleFrida = async () => {
    const port = document.getElementById("fridaPort").value.trim() || "27042";
    try {
        if (toggleSwitch.checked) {
            // await KernelSU.exec(`cp -f /data/adb/modules/kernelsu-frida/frida-server /data/local/tmp/frida-server`);
            // await KernelSU.exec(`chmod 755 /data/local/tmp/frida-server`);
            await KernelSU.exec(`/data/local/tmp/frida-server -D -l 0.0.0.0:${port} &`);
        } else {
            await KernelSU.exec("pkill -f frida-server");
        }
        // Wait a moment before re-checking status
        await new Promise((resolve) => setTimeout(resolve, 1000));
        checkFridaStatus();
    } catch (error) {
        alert("❌ Failed to toggle Frida: " + error);
        toggleSwitch.checked = !toggleSwitch.checked;
    }
};

// ✅ Initialize Frida (Check & Download if Needed)
const initializeFrida = async () => {
    log("🔍 Checking if Frida is installed...");
    const tmpDir = "/data/local/tmp";
    const binaryName = "frida-server";
    const fridaPath = `${tmpDir}/${binaryName}`;
    const downloadDir = "/storage/emulated/0/Download";
    const downloadPath = `${downloadDir}/${binaryName}`;
    const downloadedXZPath = `${downloadPath}.xz`;

    try {
        if (await checkFileExists(fridaPath)) {
            log("✅ Frida already installed in /data/local/tmp!");
            return;
        }
        // Check if the downloaded .xz file exists
        if (await checkFileExists(downloadedXZPath)) {
            log("📡 Found downloaded Frida in Download directory. Unzipping and copying...");
            // Run unxz command with proper quoting
            const { stdout, stderr } = await KernelSU.exec(
                `su -c "busybox unxz '${downloadedXZPath}'"`
            );
            log(`unxz stdout: ${stdout}\nunxz stderr: ${stderr}`);

            // Verify that unxz produced the expected file (downloadPath without the .xz extension)
            if (!(await checkFileExists(downloadPath))) {
                log("❌ Unxz command did not create the expected file.");
                return;
            }
            await KernelSU.exec(`su -c cp -f "${downloadPath}" "${fridaPath}"`);
            await KernelSU.exec(`su -c chmod +x "${fridaPath}"`);
            log("✅ Frida copied to /data/local/tmp.");
            return;
        }
        // Not found—fetch and install the latest version
        log("⬇️ Fetching latest Frida version...");
        const latestVersion = await fetchLatestFridaVersion();
        if (!latestVersion) {
            log("❌ Failed to get latest Frida version!");
            return;
        }
        log(`📡 Latest Frida Version: ${latestVersion}`);
        await downloadAndInstallFrida(latestVersion);
    } catch (error) {
        log(`❌ Error initializing Frida: ${error}`);
    }
};


// ✅ Check Frida Version (both current and latest)
const checkFridaVersion = async () => {
    const currentVersionElement = document.getElementById("currentVersion");
    const latestVersionElement = document.getElementById("latestVersion");

    try {
        const { stdout } = await KernelSU.exec("/data/local/tmp/frida-server --version");
        currentVersionElement.innerText = stdout.trim() || "Unknown";
    } catch {
        currentVersionElement.innerText = "Not Installed";
    }

    const latestVersion = await fetchLatestFridaVersion();
    latestVersionElement.innerText = latestVersion || "Error Fetching Version";
};

// ✅ Update Frida (force download & install)
const updateFrida = async () => {
    const latestVersion = document.getElementById("latestVersion").innerText;
    if (latestVersion === "Error Fetching" || latestVersion === "Unknown") {
        log("❌ Unable to check latest version!");
        return;
    }
    if (!confirm(`A new Frida version (${latestVersion}) is available. Update now?`)) return;
    try {
        log("⬇️ Downloading Frida update...");
        await downloadAndInstallFrida(latestVersion, true);
        log(`✅ Frida updated to ${latestVersion}`);
        checkFridaVersion();
    } catch (error) {
        log(`❌ Failed to update Frida: ${error}`);
    }
};

// ✅ Run checks on page load
document.addEventListener("DOMContentLoaded", () => {
    log("🟢 WebView Loaded: Running Initial Checks...");
    initializeFrida();
    checkFridaStatus();
    checkFridaVersion();
});

// ✅ Attach event listeners
document.getElementById("fridaToggle").addEventListener("change", toggleFrida);
document.getElementById("updateFrida").addEventListener("click", updateFrida);
