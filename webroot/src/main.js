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

// ✅ Check if Frida is running
const checkFridaStatus = async () => {
    try {
        const { stdout } = await KernelSU.exec("ps -A | grep frida-server");
        statusElement.innerText = stdout ? "✅ Frida Running" : "❌ Frida Stopped";
        toggleSwitch.checked = !!stdout;
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
            await KernelSU.exec(`cp -f /data/adb/modules/simple_module/system/bin/frida-server /data/local/tmp/frida-server`);
            await KernelSU.exec(`chmod 755 /data/local/tmp/frida-server`);
            await KernelSU.exec(`/data/local/tmp/frida-server -D -l 0.0.0.0:${port} &`);
        } else {
            await KernelSU.exec("pkill -f frida-server");
        }
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

    const downloadDir = "/storage/emulated/0/Download";
    const tmpDir = "/data/local/tmp";
    const fridaBinary = "frida-server";
    const fridaPath = `${tmpDir}/${fridaBinary}`;
    const downloadPath = `${downloadDir}/${fridaBinary}`;

    try {
        // ✅ Check if Frida exists in /data/local/tmp/
        const { stdout: fridaExists } = await KernelSU.exec(`[ -f ${fridaPath} ] && echo "EXISTS" || echo "MISSING"`);
        log(`📂 Frida Binary in /tmp/: ${fridaExists.trim()}`);
        if (fridaExists.trim() === "EXISTS") {
            log("✅ Frida already installed!");
            return;
        }

        // ✅ Check if Frida is in /Download/
        const { stdout: downloadExists } = await KernelSU.exec(`[ -f ${downloadPath} ] && echo "EXISTS" || echo "MISSING"`);
        log(`📂 Frida in /Download/: ${downloadExists.trim()}`);
        if (downloadExists.trim() === "EXISTS") {
            log("📡 Copying Frida to /data/local/tmp/...");
            await KernelSU.exec(`cp -f ${downloadPath} ${fridaPath}`);
            await KernelSU.exec(`chmod +x ${fridaPath}`);
            log("✅ Frida copied!");
            return;
        }

        // ✅ Fetch Latest Frida Version
        log("⬇️ Fetching latest Frida version...");
        const response = await fetch("https://api.github.com/repos/frida/frida/releases/latest");
        const data = await response.json();
        if (!data.tag_name) {
            log("❌ Failed to get latest Frida version!");
            return;
        }

        const latestVersion = data.tag_name;
        log(`📡 Latest Frida Version: ${latestVersion}`);

        const fridaDownloadUrl = `https://github.com/frida/frida/releases/download/${latestVersion}/frida-server-android-arm64.xz`;

        // ✅ Download Frida
        log("⬇️ Downloading latest Frida server...");
        await KernelSU.exec(`busybox wget --no-check-certificate -qO ${downloadPath}.xz "${fridaDownloadUrl}"`);

        // ✅ Check if the file actually downloaded
        const { stdout: fridaExistsAfterDownload } = await KernelSU.exec(`[ -s ${downloadPath}.xz ] && echo "OK" || echo "FAIL"`);
        log(`📝 Frida Download Status: ${fridaExistsAfterDownload.trim()}`);

        if (fridaExistsAfterDownload.trim() !== "OK") {
            log("❌ Frida Download Failed!");
            return;
        }

        // ✅ Extract and Set Permissions
        await KernelSU.exec(`xz -d ${downloadPath}.xz`);
        await KernelSU.exec(`chmod +x ${downloadPath}`);
        log("✅ Frida server downloaded and extracted.");

        await KernelSU.exec(`cp -f ${downloadPath} ${fridaPath}`);
        await KernelSU.exec(`chmod +x ${fridaPath}`);
        log("✅ Frida copied to /data/local/tmp/.");
    } catch (error) {
        log(`❌ Error initializing Frida: ${error}`);
    }
};

// ✅ Check Frida Version
const checkFridaVersion = async () => {
    const currentVersionElement = document.getElementById("currentVersion");
    const latestVersionElement = document.getElementById("latestVersion");

    try {
        const { stdout } = await KernelSU.exec("/data/local/tmp/frida-server --version");
        currentVersionElement.innerText = stdout.trim() || "Unknown";
    } catch {
        currentVersionElement.innerText = "Not Installed";
    }

    try {
        const response = await fetch("https://api.github.com/repos/frida/frida/releases/latest");
        const data = await response.json();
        latestVersionElement.innerText = data.tag_name || "Error Fetching Version";
    } catch {
        latestVersionElement.innerText = "Error Fetching";
    }
};

// ✅ Update Frida
const updateFrida = async () => {
    const latestVersion = document.getElementById("latestVersion").innerText;

    if (latestVersion === "Error Fetching" || latestVersion === "Unknown") {
        log("❌ Unable to check latest version!");
        return;
    }

    if (!confirm(`A new Frida version (${latestVersion}) is available. Update now?`)) return;

    try {
        log("⬇️ Downloading Frida update...");
        const fridaDownloadUrl = `https://github.com/frida/frida/releases/download/${latestVersion}/frida-server-android-arm64.xz`;

        await KernelSU.exec(`busybox wget --no-check-certificate -qO /data/local/tmp/frida-server.xz "${fridaDownloadUrl}"`);
        await KernelSU.exec("xz -d /data/local/tmp/frida-server.xz");
        await KernelSU.exec("chmod +x /data/local/tmp/frida-server");

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
