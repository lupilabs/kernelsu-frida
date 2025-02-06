# KernelSU Frida Control

KernelSU Frida Control is an Android module that lets you control, configure, and update the [Frida](https://frida.re/) server through a simple webview interface. Using KernelSU to execute privileged commands, this module allows you to toggle the Frida server on and off, rename the server binary, change its listening port, and  update to the latest release—all from your mobile device.

## Features

- **Toggle Frida Server:** Easily start or stop the Frida server with a single switch.
- **Custom Configuration:** Change the server’s name and port. The module uses a dedicated folder in `/data/local/tmp` (named with a pattern like `adirf<port>`) to “remember” your configuration.
- **Automatic Update:** Fetch and install the latest Frida server release from GitHub.
- **Persistent Settings:** On module startup, the tool auto-detects an existing server configuration (folder and binary) so that your previous settings (custom name and port) are automatically loaded.
- **Debug Logging:** View debug logs and status messages directly in the webview interface.

## Requirements

- **Android Device with Root Access:** The module requires `su` privileges to control system-level processes.
- **KernelSU:** This module is built on top of KernelSU for executing commands as root.
- **BusyBox:** The module depends on BusyBox (with utilities like `wget` and `unxz`) being installed on the device.
- **Internet Access:** Required to fetch updates from the Frida GitHub releases.

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/yourusername/kernelsu-frida-control.git
   cd kernelsu-frida-control
