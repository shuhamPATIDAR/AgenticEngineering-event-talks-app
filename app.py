from flask import Flask, jsonify, render_template, request
import urllib.request
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import os
import json
import time
from datetime import datetime

app = Flask(__name__)

FEED_URL = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'
CACHE_FILE = 'releases_cache.json'
CACHE_EXPIRY_SECONDS = 3600  # 1 hour cache

def fetch_and_parse_feed():
    """Fetches the XML feed and parses it into a structured list of release notes."""
    req = urllib.request.Request(
        FEED_URL,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    with urllib.request.urlopen(req) as response:
        xml_data = response.read()

    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('atom:entry', ns)

    parsed_entries = []
    for entry in entries:
        title = entry.find('atom:title', ns).text
        updated = entry.find('atom:updated', ns).text
        
        # Extract href link
        link_elem = entry.find("atom:link[@rel='alternate']", ns)
        link = link_elem.get('href') if link_elem is not None else ''
        
        # Get unique entry ID
        entry_id = entry.find('atom:id', ns).text if entry.find('atom:id', ns) is not None else ''

        content_html = entry.find('atom:content', ns).text
        if not content_html:
            continue

        soup = BeautifulSoup(content_html, 'html.parser')
        h3_tags = soup.find_all('h3')

        updates = []
        if not h3_tags:
            # If no sections, treat the entire body as a single general update
            updates.append({
                'id': f"{entry_id}_0",
                'type': 'General',
                'html': str(soup),
                'text': soup.get_text(separator=' ').strip()
            })
        else:
            for idx, h3 in enumerate(h3_tags):
                update_type = h3.get_text().strip()

                # Get sibling elements until the next h3 tag
                sibling = h3.next_sibling
                sibling_elements = []
                while sibling and sibling.name != 'h3':
                    if sibling.name:
                        sibling_elements.append(str(sibling))
                    elif isinstance(sibling, str) and sibling.strip():
                        sibling_elements.append(sibling.strip())
                    sibling = sibling.next_sibling

                update_html = "".join(sibling_elements).strip()
                update_soup = BeautifulSoup(update_html, 'html.parser')
                update_text = update_soup.get_text(separator=' ').strip()

                updates.append({
                    'id': f"{entry_id}_{idx}",
                    'type': update_type,
                    'html': update_html,
                    'text': update_text
                })

        parsed_entries.append({
            'date': title,
            'updated': updated,
            'link': link,
            'updates': updates
        })

    return parsed_entries

def get_cached_releases(force_refresh=False):
    """Retrieves release notes from cache or fetches them if expired/forced."""
    now = time.time()
    
    # Check if cache exists and is fresh
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            mtime = os.path.getmtime(CACHE_FILE)
            if now - mtime < CACHE_EXPIRY_SECONDS:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f), "cache"
        except Exception:
            pass  # Fallback to fetch on any read failure
            
    # Fetch from server
    try:
        releases = fetch_and_parse_feed()
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(releases, f, ensure_ascii=False, indent=2)
        return releases, "live"
    except Exception as e:
        # If live fetch fails but cache exists, return stale cache as fallback
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f), "stale_fallback"
            except Exception:
                pass
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def api_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        releases, source = get_cached_releases(force_refresh=force_refresh)
        return jsonify({
            'success': True,
            'source': source,
            'count': len(releases),
            'last_updated': datetime.fromtimestamp(os.path.getmtime(CACHE_FILE)).strftime('%Y-%m-%d %H:%M:%S'),
            'data': releases
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
