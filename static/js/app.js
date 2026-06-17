/**
 * BigQuery Release Notes Explorer - Application Script
 * Orchestrates API calls, filters, timeline rendering, theme management, and X Composer.
 */

document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let allReleases = [];
    let selectedUpdates = new Map(); // Map of updateId -> { date, type, text, link }
    let searchQuery = '';
    let currentFilter = 'all';
    let currentTheme = localStorage.getItem('theme') || 'dark';

    // DOM Selectors
    const htmlEl = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const filterTagsContainer = document.getElementById('filter-tags');
    const timelineFeed = document.getElementById('timeline-feed');
    
    // States
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');
    
    // Status Badge
    const statusBadge = document.getElementById('status-badge');
    const statusDot = statusBadge.querySelector('.status-dot');
    const statusText = statusBadge.querySelector('.status-text');

    // Selection Bar
    const selectionBar = document.getElementById('selection-bar');
    const selectionCountEl = selectionBar.querySelector('.selection-count');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    const tweetSelectedBtn = document.getElementById('tweet-selected-btn');

    // Modal & Composer
    const tweetModal = document.getElementById('tweet-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const cancelTweetBtn = document.getElementById('cancel-tweet');
    const sendTweetBtn = document.getElementById('send-tweet-btn');
    const tweetTextarea = document.getElementById('tweet-textarea');
    const charCounter = document.getElementById('char-counter');
    const ringProgress = document.getElementById('ring-progress');
    const tweetPreviewText = document.getElementById('tweet-preview-text');
    const previewLinkCard = document.getElementById('preview-link-card');
    const hashtagButtons = document.querySelectorAll('.hash-tag');

    // MAX Tweet Characters limit
    const MAX_TWEET_CHARS = 280;
    const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 12; // 75.39px

    /* ==========================================================================
       Theme Management
       ========================================================================== */
    function initTheme() {
        htmlEl.setAttribute('data-theme', currentTheme);
        updateThemeToggleButton();
    }

    function toggleTheme() {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', currentTheme);
        localStorage.setItem('theme', currentTheme);
        updateThemeToggleButton();
    }

    function updateThemeToggleButton() {
        const icon = themeToggleBtn.querySelector('i');
        if (currentTheme === 'light') {
            icon.className = 'fa-solid fa-sun';
            themeToggleBtn.title = 'Switch to Dark Mode';
        } else {
            icon.className = 'fa-solid fa-moon';
            themeToggleBtn.title = 'Switch to Light Mode';
        }
    }

    themeToggleBtn.addEventListener('click', toggleTheme);

    /* ==========================================================================
       API Data Fetching
       ========================================================================== */
    async function loadReleaseNotes(forceRefresh = false) {
        showState('loading');
        updateStatusBadge('loading', 'Fetching notes...');
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;

        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Server returned HTTP status ${response.status}`);
            }
            const payload = await response.json();
            
            if (payload.success) {
                allReleases = payload.data;
                
                // Update Status Badge Source Description
                let statusMsg = 'System Connected';
                if (payload.source === 'live') {
                    statusMsg = 'Fetched live updates';
                } else if (payload.source === 'cache') {
                    statusMsg = `Cached: ${payload.last_updated.split(' ')[1]}`;
                } else if (payload.source === 'stale_fallback') {
                    statusMsg = 'Offline: Showing cached data';
                }
                
                updateStatusBadge(payload.source === 'stale_fallback' ? 'error' : payload.source, statusMsg);
                
                // Render view
                renderFeed();
            } else {
                throw new Error(payload.error || 'Failed to fetch release notes metadata.');
            }
        } catch (err) {
            console.error('Error fetching release notes:', err);
            errorMessage.textContent = err.message || 'An unknown network error occurred.';
            showState('error');
            updateStatusBadge('error', 'Sync Failed');
        } finally {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }

    function updateStatusBadge(state, message) {
        statusBadge.className = `status-badge ${state}`;
        statusText.textContent = message;
    }

    function showState(state) {
        loadingState.style.display = state === 'loading' ? 'flex' : 'none';
        emptyState.style.display = state === 'empty' ? 'flex' : 'none';
        errorState.style.display = state === 'error' ? 'flex' : 'none';
        timelineFeed.style.display = state === 'success' ? 'block' : 'none';
    }

    refreshBtn.addEventListener('click', () => loadReleaseNotes(true));
    retryBtn.addEventListener('click', () => loadReleaseNotes(true));

    /* ==========================================================================
       Filters and Search UI Handler
       ========================================================================== */
    // Input Search Handler
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        clearSearchBtn.style.display = searchQuery.length > 0 ? 'block' : 'none';
        renderFeed();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        renderFeed();
    });

    // Tag Filter Click Handler
    filterTagsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tag-btn');
        if (!btn) return;

        // Toggle Active
        filterTagsContainer.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentFilter = btn.dataset.filter;
        renderFeed();
    });

    // Reset Buttons
    resetFiltersBtn.addEventListener('click', resetFilters);
    
    function resetFilters() {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        
        filterTagsContainer.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
        filterTagsContainer.querySelector('[data-filter="all"]').classList.add('active');
        currentFilter = 'all';
        
        renderFeed();
    }

    /* ==========================================================================
       Timeline Content Rendering
       ========================================================================== */
    function renderFeed() {
        timelineFeed.innerHTML = '';
        
        if (allReleases.length === 0) {
            showState('empty');
            return;
        }

        let totalRenderedUpdates = 0;

        // Iterate through dates
        allReleases.forEach(entry => {
            // Filter the updates in this entry
            const filteredUpdates = entry.updates.filter(update => {
                // Type Filter
                const matchesType = currentFilter === 'all' || update.type.toLowerCase() === currentFilter.toLowerCase();
                
                // Text Search Filter
                const matchesSearch = !searchQuery || 
                    entry.date.toLowerCase().includes(searchQuery) ||
                    update.type.toLowerCase().includes(searchQuery) ||
                    update.text.toLowerCase().includes(searchQuery);

                return matchesType && matchesSearch;
            });

            // If entry has matching updates, render the date group
            if (filteredUpdates.length > 0) {
                totalRenderedUpdates += filteredUpdates.length;

                const dateGroup = document.createElement('div');
                dateGroup.className = 'date-group';
                
                // Construct Header
                const dateHeader = `
                    <div class="date-node"></div>
                    <div class="date-header">
                        <h2>${entry.date}</h2>
                        ${entry.link ? `<a href="${entry.link}" target="_blank" class="date-link" title="Open official notes page"><i class="fa-solid fa-up-right-from-square"></i></a>` : ''}
                    </div>
                `;
                
                // Construct Updates list
                const updatesList = document.createElement('div');
                updatesList.className = 'updates-list';

                filteredUpdates.forEach(update => {
                    const card = document.createElement('div');
                    card.className = `update-card ${update.type.toLowerCase()}-border`;
                    card.dataset.id = update.id;
                    
                    const isChecked = selectedUpdates.has(update.id);
                    if (isChecked) {
                        card.classList.add('selected');
                    }

                    // Card internal layout
                    card.innerHTML = `
                        <div class="checkbox-column">
                            <label class="custom-checkbox">
                                <input type="checkbox" class="update-selector" ${isChecked ? 'checked' : ''}>
                                <span class="checkmark"></span>
                            </label>
                        </div>
                        <div class="content-column">
                            <div class="badge-row">
                                <span class="type-badge ${update.type.toLowerCase()}">${update.type}</span>
                            </div>
                            <div class="update-html">${update.html}</div>
                        </div>
                        <div class="action-column">
                            <button class="card-tweet-btn" title="Tweet this update">
                                <i class="fa-brands fa-x-twitter"></i>
                            </button>
                        </div>
                    `;

                    // Select Card Event
                    const checkbox = card.querySelector('.update-selector');
                    checkbox.addEventListener('change', (e) => {
                        toggleUpdateSelection(update, entry, e.target.checked);
                    });

                    // Direct Tweet Card Event
                    const tweetBtn = card.querySelector('.card-tweet-btn');
                    tweetBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openTweetComposerSingle(update, entry);
                    });

                    // Clicking anywhere on the card (except links and buttons) checks it
                    card.addEventListener('click', (e) => {
                        if (e.target.tagName !== 'A' && 
                            e.target.tagName !== 'INPUT' && 
                            !e.target.closest('.card-tweet-btn') &&
                            !e.target.closest('.custom-checkbox')) {
                            const newChecked = !checkbox.checked;
                            checkbox.checked = newChecked;
                            toggleUpdateSelection(update, entry, newChecked);
                        }
                    });

                    updatesList.appendChild(card);
                });

                dateGroup.innerHTML = dateHeader;
                dateGroup.appendChild(updatesList);
                timelineFeed.appendChild(dateGroup);
            }
        });

        if (totalRenderedUpdates === 0) {
            showState('empty');
        } else {
            showState('success');
        }
    }

    /* ==========================================================================
       Selection Management
       ========================================================================== */
    function toggleUpdateSelection(update, entry, isSelected) {
        const card = document.querySelector(`.update-card[data-id="${update.id}"]`);
        
        if (isSelected) {
            selectedUpdates.set(update.id, {
                id: update.id,
                date: entry.date,
                type: update.type,
                text: update.text,
                link: entry.link
            });
            if (card) card.classList.add('selected');
        } else {
            selectedUpdates.delete(update.id);
            if (card) card.classList.remove('selected');
        }

        updateSelectionBar();
    }

    function updateSelectionBar() {
        const count = selectedUpdates.size;
        selectionCountEl.textContent = count;
        
        if (count > 0) {
            selectionBar.classList.add('active');
        } else {
            selectionBar.classList.remove('active');
        }
    }

    clearSelectionBtn.addEventListener('click', () => {
        // Uncheck all in state
        selectedUpdates.clear();
        updateSelectionBar();
        
        // Reflect in DOM checkboxes
        document.querySelectorAll('.update-selector').forEach(chk => chk.checked = false);
        document.querySelectorAll('.update-card').forEach(card => card.classList.remove('selected'));
    });

    /* ==========================================================================
       X / Twitter Composer Modal Logic
       ========================================================================== */
    // Open composer for single item
    function openTweetComposerSingle(update, entry) {
        const headline = `BigQuery Update (${entry.date}):\n`;
        const typePrefix = `${update.type}: `;
        const summaryText = cleanTextForTweet(update.text);
        const link = update.link || 'https://docs.cloud.google.com/bigquery/docs/release-notes';

        // Truncate summary if necessary to leave space for link and hashtags
        const maxTextLen = MAX_TWEET_CHARS - headline.length - typePrefix.length - link.length - 20; // safe buffer
        let textToShow = summaryText;
        if (summaryText.length > maxTextLen) {
            textToShow = summaryText.substring(0, maxTextLen - 3) + '...';
        }

        const draft = `${headline}${typePrefix}${textToShow}\n\n${link}`;
        
        // Show modal prefilled
        showComposerModal(draft, link);
    }

    // Open composer for multiple selected items
    tweetSelectedBtn.addEventListener('click', () => {
        if (selectedUpdates.size === 0) return;

        let draft = '';
        let primaryLink = 'https://docs.cloud.google.com/bigquery/docs/release-notes';

        if (selectedUpdates.size === 1) {
            // Revert to single
            const [singleUpdate] = selectedUpdates.values();
            const headline = `BigQuery Update (${singleUpdate.date}):\n`;
            const typePrefix = `${singleUpdate.type}: `;
            const summaryText = cleanTextForTweet(singleUpdate.text);
            const maxTextLen = MAX_TWEET_CHARS - headline.length - typePrefix.length - singleUpdate.link.length - 20;
            let textToShow = summaryText;
            if (summaryText.length > maxTextLen) {
                textToShow = summaryText.substring(0, maxTextLen - 3) + '...';
            }
            draft = `${headline}${typePrefix}${textToShow}\n\n${singleUpdate.link}`;
            primaryLink = singleUpdate.link;
        } else {
            // Summarize multiples
            draft = `Google Cloud #BigQuery Updates Log 🚀\n\n`;
            
            // Loop and add bullets
            let idx = 1;
            for (const item of selectedUpdates.values()) {
                const bullet = `• [${item.date}] ${item.type}: ${item.text}`;
                // Keep appending bullets as long as we have character spacing
                if ((draft + bullet + `\n\nRead notes: ${primaryLink}`).length < MAX_TWEET_CHARS - 30) {
                    draft += `${bullet}\n`;
                    idx++;
                } else {
                    draft += `• ...and ${selectedUpdates.size - idx + 1} more updates\n`;
                    break;
                }
            }
            
            draft += `\nRead notes: ${primaryLink}`;
        }

        showComposerModal(draft, primaryLink);
    });

    function cleanTextForTweet(text) {
        // Clean double white spaces, tabs, and format new lines nicely
        return text
            .replace(/\s+/g, ' ')
            .replace(/\s*·\s*/g, ' · ')
            .trim();
    }

    function showComposerModal(initialText, link) {
        tweetTextarea.value = initialText;
        
        // Update URL metadata preview card
        const linkEl = document.querySelector('.link-card-domain');
        try {
            const domain = new URL(link).hostname;
            linkEl.textContent = domain;
        } catch (e) {
            linkEl.textContent = 'docs.cloud.google.com';
        }
        
        // Trigger calculation
        handleComposerInput();
        
        tweetModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Lock background scroll
        tweetTextarea.focus();
        
        // Set cursor to start or end of text
        tweetTextarea.setSelectionRange(initialText.length, initialText.length);
    }

    function closeComposerModal() {
        tweetModal.style.display = 'none';
        document.body.style.overflow = ''; // Release scroll
    }

    closeModalBtn.addEventListener('click', closeComposerModal);
    cancelTweetBtn.addEventListener('click', closeComposerModal);
    
    // Close modal on click outside modal container
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) {
            closeComposerModal();
        }
    });

    // Handle Textarea changes
    tweetTextarea.addEventListener('input', handleComposerInput);

    function handleComposerInput() {
        const text = tweetTextarea.value;
        const length = text.length;
        const remaining = MAX_TWEET_CHARS - length;

        // Counter UI
        charCounter.textContent = remaining;

        // Progress Circular SVG Meter
        let percentage = (length / MAX_TWEET_CHARS) * 100;
        if (percentage > 100) percentage = 100;
        
        const offset = CIRCLE_CIRCUMFERENCE - (percentage / 100) * CIRCLE_CIRCUMFERENCE;
        ringProgress.style.strokeDashoffset = offset;

        // Colors based on usage limits
        if (remaining <= 0) {
            ringProgress.className.baseVal = 'ring-progress danger';
            charCounter.className = 'char-counter danger';
        } else if (remaining <= 20) {
            ringProgress.className.baseVal = 'ring-progress warning';
            charCounter.className = 'char-counter danger';
        } else {
            ringProgress.className.baseVal = 'ring-progress';
            charCounter.className = 'char-counter';
        }

        // Enable / Disable Post button
        if (length === 0 || remaining < 0) {
            sendTweetBtn.disabled = true;
        } else {
            sendTweetBtn.disabled = false;
        }

        // Update Live Preview Block
        tweetPreviewText.textContent = text;
        if (text) {
            tweetPreviewText.style.display = 'block';
        } else {
            tweetPreviewText.style.display = 'none';
        }
    }

    // Hashtag Injector Quick Buttons
    hashtagButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            const currentText = tweetTextarea.value;
            
            if (!currentText.includes(tag)) {
                // Determine spacer: check if we should add space before hashtag
                const spacing = currentText.length > 0 && !currentText.endsWith(' ') ? ' ' : '';
                tweetTextarea.value = currentText + spacing + tag;
                
                handleComposerInput();
                tweetTextarea.focus();
            }
        });
    });

    // Final Post Button triggering Twitter Web Intent
    sendTweetBtn.addEventListener('click', () => {
        const text = tweetTextarea.value;
        if (!text || text.length > MAX_TWEET_CHARS) return;
        
        // Encode and open Twitter Intent URL
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'width=550,height=420,left=150,top=100');
        
        closeComposerModal();
    });

    /* ==========================================================================
       Initial Setup
       ========================================================================== */
    initTheme();
    loadReleaseNotes(false); // Fetch initial data (from cache if valid)
});
