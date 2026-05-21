# liteproducer
The very simple, production-ready AI-powered literature producer 📚🤖

![liteproducer dark theme](docs/screenshots/dark-theme.png)

<details>
<summary>More themes</summary>

![liteproducer light theme](docs/screenshots/light-theme.png)

![liteproducer sepia theme](docs/screenshots/sepia-theme.png)

</details>

## Features

- **Custom API endpoint** – works with any OpenAI-compatible chat completions API
- **Genre & plot customization** – pick a genre, describe the plot, set the number of chapters
- **Real-time streaming** – watch the story being written token by token in the browser
- **Mid-generation instructions** – send the AI new directions at any time while the book is being written
- **Continuous mode** – automatically start generating a new book as soon as the previous one finishes
- **PDF export** – each completed book is saved as a downloadable `.pdf` file

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

Then open **http://localhost:5000** in your browser.

## Usage

1. Enter your **Chat Completions Endpoint** (e.g. `https://api.openai.com/v1/chat/completions`)
2. Enter your **API Key** and **Model** name
3. Set a **Genre**, optional **Title**, **Number of Chapters**, and **Plot / Synopsis**
4. Click **▶ Generate Book** – the outline and chapters will stream live
5. While the book is generating, type instructions in the **Mid-generation instructions** box and click **Send** – they will be incorporated into the next chapter
6. Toggle **🔁 Continuous Mode** to have new books start automatically one after another
7. Download finished books from the **📂 Generated Books** section

Generated PDFs are saved in the `books/` directory.
