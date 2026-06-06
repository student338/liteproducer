# Build Instructions for liteproducer

## Prerequisites

- **Node.js** >= 18
- **Rust** (latest stable via rustup)
- **Tauri CLI**: `cargo install tauri-cli`

### Platform-specific:
- **Windows** (.exe): Visual Studio Build Tools with C++ workload
- **macOS** (.app): Xcode Command Line Tools
- **Linux** (.appimage): `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`
- **Android** (.apk): Android Studio, NDK, JDK 17+
- **iOS** (.ipa): macOS with Xcode 15+, Apple Developer account

## Development

```bash
cd pwa
npm install
npm run tauri:dev
```

## Building Installers

### Windows (.exe / .msi)
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/nsis/liteproducer_1.0.0_x64-setup.exe
# Output: src-tauri/target/release/bundle/msi/liteproducer_1.0.0_x64.msi
```

### macOS (.app / .dmg)
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/dmg/liteproducer_1.0.0_x64.dmg
# Output: src-tauri/target/release/bundle/macos/liteproducer.app
```

### Linux (.appimage / .deb)
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/appimage/liteproducer_1.0.0_amd64.AppImage
# Output: src-tauri/target/release/bundle/deb/liteproducer_1.0.0_amd64.deb
```

### Android (.apk)
```bash
npm run tauri:android:init   # First time only
npm run tauri:android:build
# Output: src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

### iOS (.ipa)
```bash
npm run tauri:ios:init   # First time only
npm run tauri:ios:build
# Output: src-tauri/gen/apple/build/arm64/liteproducer.ipa
```

## PWA (Progressive Web App)

The app also works as a standalone PWA when served from any static hosting:

```bash
npm run build
# Deploy the 'dist/' folder to any static host (Netlify, Vercel, GitHub Pages, etc.)
```

The PWA includes:
- Offline support via Service Worker
- Install prompt (Add to Home Screen)
- Full-screen standalone mode
- All features work without a backend server

## Local AI (llama.cpp)

The app supports running LLM inference locally via a llama.cpp Web Worker (WebAssembly):
1. Open **🧠 Local AI (llama.cpp)** settings
2. Select a `.gguf` or `.safetensors` model file from your device, or enter a URL to a model
3. Click **⬇️ Load Model** (model is loaded into the browser's memory)
4. Check **Use local model for generation**
5. Generate books without needing an API key or internet connection

Any GGUF-compatible model works — download quantized models from Hugging Face (e.g. TheBloke's GGUF repositories).
