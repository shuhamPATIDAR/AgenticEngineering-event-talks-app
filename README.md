# BigQuery Release Notes Explorer 🚀

A premium, glassmorphic web application built with **Python Flask** and **plain vanilla HTML, CSS, and JavaScript** that fetches, parses, caches, and presents Google BigQuery release notes chronologically. It allows you to search, filter, select, and draft custom tweets about specific updates directly via X/Twitter Web Intents.

---

## 🌟 Main Features

*   **Granular Release Splitting**: Dynamically splits daily release entries into individual sub-updates (e.g., separating a *Feature* from an *Issue*), allowing you to tweet about specific items instead of a whole day's log.
*   **X/Twitter Composer Modal**: A custom-built, authentic social media composer mimicking the layout of X. It features:
    *   **SVG Character Limit Ring**: Calculates remaining space relative to X's 280-character limit and changes colors as you approach it (amber at 20 characters, red at 0).
    *   **Live Preview Card**: Shows you a mock version of the tweet before sending.
    *   **Quick Hashtags**: Fast injection of tags like `#BigQuery` and `#GoogleCloud`.
*   **Multi-Selection Drafting**: Checkboxes on the left of each update card allow you to group multiple updates and compile them into a unified draft.
*   **Instant Search & Filters**: Search content dynamically and filter by GCP update categories (*Feature*, *Announcement*, *Issue*, *Deprecated*, *Changed*).
*   **Smart Backend Caching**: Caches feed entries to `releases_cache.json` for 1 hour to ensure page loads are near-instantaneous, with automatic offline fallback to cached files if Google's servers are down.
*   **Theme Switcher**: Fully functional Dark and Light modes using modern, responsive CSS variables.

---

## 📂 Project Structure

```text
D:\agy_cli_project\
│
├── app.py                  # Flask server containing feed fetcher, parsing engine, caching, and API routes
├── .gitignore              # Files ignored by git (e.g., virtual environment, __pycache__, cache database)
│
├── templates/
│   └── index.html          # HTML5 document containing timeline layout, modals, and controllers
│
└── static/
    ├── css/
    │   └── style.css       # Design system, glassmorphic styles, themes, and animations
    └── js/
        └── app.js          # Core orchestrator managing API connections, filters, selection states, and composer
```

---

## 🚀 Setup & Execution

### Prerequisites
Make sure you have **Python 3.x** installed. You will need `Flask` and `BeautifulSoup4` for parsing HTML nodes.

### 1. Install Dependencies
Run the following command to install the required packages:
```bash
pip install flask beautifulsoup4
```

### 2. Run the Application
Start the Flask development server:
```bash
python app.py
```

### 3. Open in Browser
Navigate to the following address in your web browser:
```text
http://127.0.0.1:5000/
```

---

## ⚙️ How It Works (Technical Context)

### Parsing Engine
The BigQuery RSS feed is written in Atom XML format. Under each `<entry>` node, the HTML payload contains multiple updates grouped by headings:
```html
<h3>Feature</h3>
<p>New feature details...</p>
<h3>Issue</h3>
<p>Known issue details...</p>
```
[`app.py`](file:///D:/agy_cli_project/app.py) handles this by traversing the HTML hierarchy and isolating all siblings between adjacent `<h3>` tags. It assigns a unique ID and text representation to each update block so the client can manipulate them independently.

### Caching
To maintain high performance and avoid rate limits, the app keeps a local file cache. Standard requests check if the cache is fresh (< 1 hour). When a user clicks **Refresh** in the header, the UI activates a spinning keyframe animation and requests a force update (`/api/releases?refresh=true`) to fetch the live XML, overwrite the cache, and return fresh data.
