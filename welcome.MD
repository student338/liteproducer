# Welcome to liteproducer 📚🤖

Welcome! **liteproducer** is a simple, production-ready AI-powered literature producer that generates full-length books using any OpenAI-compatible API. This guide will help you get oriented and started quickly.

## What is liteproducer?

liteproducer lets you generate complete books — chapter by chapter — using large language models. You provide a creative seed, genre, and plot synopsis, and the AI writes an entire book in real time. Finished books are exported as downloadable PDFs.

The project ships in two forms:

- **Flask web server** — a Python-based backend with a browser UI
- **PWA / Tauri desktop app** — a standalone client (no server required) that calls LLM APIs directly or runs models locally via WebLLM

## Project Structure

```
liteproducer/
├── app.py              # Flask application (main server entry point)
├── requirements.txt    # Python dependencies
├── templates/          # HTML templates for the web UI
├── static/             # Static assets (CSS, JS, images)
├── books/              # Generated PDF books are saved here
├── docs/               # Documentation and screenshots
├── pwa/                # Progressive Web App / Tauri desktop app
│   ├── src/            # Frontend source code
│   ├── src-tauri/      # Tauri native shell configuration
│   ├── BUILD.md        # Detailed build instructions for the PWA
│   └── package.json    # Node.js dependencies and scripts
├── README.md           # Full project documentation
└── welcome.MD          # This file — quick-start guide
```

## Getting Started

### Prerequisites

- **Python 3.10+** and **pip** (for the Flask server)
- **Node.js 18+** and **npm** (only for the PWA / desktop app)

### Running the Flask Server

```bash
# Clone the repository
git clone https://github.com/student338/liteproducer.git
cd liteproducer

# Create a virtual environment
python -m venv venv
source venv/bin/activate    # Linux / macOS
# venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Start the server
python app.py
```

Open **http://localhost:5000** in your browser.

### Running the PWA (Desktop App)

```bash
cd pwa
npm install
npm run dev    # Development server at http://localhost:1420
```

For native desktop builds (Windows, macOS, Linux) or mobile builds (Android, iOS), see [`pwa/BUILD.md`](pwa/BUILD.md).

## How to Use

1. Open **🔌 API Settings** and configure your chat completions endpoint, API key, and model.
2. Enter a **Super-Prompt** seed — the AI will derive genre, title, and plot automatically — or fill those fields in manually.
3. Set the number of chapters and click **▶ Generate Book**.
4. Watch the story stream live. Use **Mid-generation instructions** to steer the AI while it writes.
5. Download finished books as PDFs from the **📂 Generated Books** section.

## Key Features

| Feature | Description |
|---------|-------------|
| Custom API endpoint | Works with any OpenAI-compatible API |
| Real-time streaming | Watch the story written token by token |
| Mid-generation instructions | Redirect the AI mid-chapter |
| Continuous mode | Auto-start a new book when the previous finishes |
| PDF export | Every completed book is saved as a `.pdf` |
| Five themes | Dark, Light, Sepia, Ocean, Terminal |
| WebLLM (local AI) | Run models on-device, no API key needed |

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests. Please review the existing code style and follow the conventions used in the project.

## Further Reading

- [README.md](README.md) — full documentation with screenshots and advanced usage
- [pwa/BUILD.md](pwa/BUILD.md) — detailed build instructions for native desktop/mobile apps
- [LICENSE](LICENSE) — project license

---

Happy writing! ✍️
