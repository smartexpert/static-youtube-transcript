/**
 * YouTube Transcript Extractor Bookmarklet
 *
 * AUTOMATED VERSION - Intercepts XHR requests to capture transcript automatically
 *
 * Usage:
 * 1. Go to a YouTube video page
 * 2. Click the bookmarklet
 * 3. Click the CC button on the video
 * 4. Transcript is automatically captured and copied to clipboard
 * 5. Click "Open App" to process the transcript
 *
 * Fallback: Manual fetch button if CC was already enabled
 *
 * Note: Uses DOM methods instead of innerHTML to comply with YouTube's Trusted Types CSP
 *
 * DEBUG MODE:
 * To enable debug logging, change DEBUG to true below.
 * This will log all XHR/Fetch interceptions to the console with '[YT Transcript]' prefix.
 */

(function() {
    // ========== DEBUG FLAG ==========
    // Set to true to enable console logging for troubleshooting
    const DEBUG = false;
    const log = DEBUG ? console.log.bind(console, '[YT Transcript]') : () => {};

    // Check if we're on YouTube
    if (!window.location.hostname.includes('youtube.com')) {
        alert('This bookmarklet only works on YouTube video pages.');
        return;
    }

    // Check if we're on a video page
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) {
        alert('Please navigate to a YouTube video page.');
        return;
    }

    // Try to find ytInitialPlayerResponse
    let playerResponse = null;
    if (window.ytInitialPlayerResponse) {
        playerResponse = window.ytInitialPlayerResponse;
    }

    if (!playerResponse) {
        alert('Could not find video data.');
        return;
    }

    // Extract video title
    const title = playerResponse.videoDetails?.title || document.title.replace(' - YouTube', '');

    // Extract caption tracks
    const captions = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) {
        alert('No captions available for this video.');
        return;
    }

    // Remove existing overlay if present
    const existing = document.getElementById('yt-transcript-extractor');
    if (existing) {
        existing.remove();
    }

    // State
    let capturedTranscript = null;
    let isIntercepting = false;

    // ========== HELPER: Create styled element ==========
    function createEl(tag, styles, text) {
        const el = document.createElement(tag);
        if (styles) el.style.cssText = styles;
        if (text) el.textContent = text;
        return el;
    }

    // ========== HELPER: Update status display ==========
    function updateStatus(emoji, mainText, mainColor, subText, extraLine) {
        statusDiv.textContent = '';

        const emojiEl = createEl('div', 'font-size:24px;margin-bottom:8px', emoji);
        statusDiv.appendChild(emojiEl);

        const mainEl = createEl('div', 'color:' + mainColor + ';font-weight:600', mainText);
        statusDiv.appendChild(mainEl);

        if (subText) {
            const subEl = createEl('div', 'color:#6b7280;font-size:12px;margin-top:4px', subText);
            statusDiv.appendChild(subEl);
        }

        if (extraLine) {
            const extraEl = createEl('div', 'color:' + extraLine.color + ';font-size:11px;margin-top:8px', extraLine.text);
            statusDiv.appendChild(extraEl);
        }
    }

    // ========== XHR INTERCEPTION ==========
    function installXHRInterceptor(onCapture) {
        if (isIntercepting) return;
        isIntercepting = true;

        log('XHR interceptor installed');

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._yt_url = url;
            // Check for timedtext URLs - be more lenient with the filter
            this._yt_isTimedText = url && (url.includes('timedtext') || url.includes('api/timedtext'));
            if (this._yt_isTimedText) {
                log('Detected timedtext request:', url.substring(0, 100));
            }
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function(body) {
            if (this._yt_isTimedText) {
                this.addEventListener('load', function() {
                    log('timedtext response received, length:', this.responseText?.length || 0);
                    if (this.responseText && this.responseText.length > 100) {
                        try {
                            const json = JSON.parse(this.responseText);
                            if (json.events && json.events.length > 0) {
                                log('Valid transcript captured!', json.events.length, 'events');
                                onCapture(this.responseText, json);
                            } else {
                                log('JSON has no events:', Object.keys(json));
                            }
                        } catch (e) {
                            log('Failed to parse JSON:', e.message);
                        }
                    }
                });
            }
            return originalSend.call(this, body);
        };

        // Also intercept fetch API in case YouTube uses it
        const originalFetch = window.fetch;
        window.fetch = async function(input, init) {
            const url = typeof input === 'string' ? input : input.url;
            const isTimedText = url && (url.includes('timedtext') || url.includes('api/timedtext'));

            if (isTimedText) {
                log('Detected timedtext fetch:', url.substring(0, 100));
            }

            const response = await originalFetch.call(this, input, init);

            if (isTimedText) {
                // Clone response so we can read it
                const clone = response.clone();
                clone.text().then(text => {
                    log('fetch response received, length:', text?.length || 0);
                    if (text && text.length > 100) {
                        try {
                            const json = JSON.parse(text);
                            if (json.events && json.events.length > 0) {
                                log('Valid transcript captured via fetch!', json.events.length, 'events');
                                onCapture(text, json);
                            }
                        } catch (e) {
                            log('Failed to parse fetch JSON:', e.message);
                        }
                    }
                }).catch(err => {
                    log('Failed to read fetch response:', err.message);
                });
            }

            return response;
        };

        log('Fetch interceptor installed');
    }

    // ========== UI CREATION ==========
    const overlay = document.createElement('div');
    overlay.id = 'yt-transcript-extractor';
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;background:#0f0f0f;color:#f1f1f1;padding:20px;border-radius:12px;z-index:999999;max-width:400px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid #272727';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px';

    const icon = document.createElement('span');
    icon.textContent = '▶';
    icon.style.cssText = 'color:#ff0000;font-size:20px';

    const headerText = document.createElement('span');
    headerText.textContent = 'Transcript Extractor';
    headerText.style.cssText = 'font-weight:600;font-size:16px';

    headerLeft.appendChild(icon);
    headerLeft.appendChild(headerText);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:none;border:none;color:#aaa;cursor:pointer;font-size:24px;line-height:1;padding:0';
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Video title (using DOM methods instead of innerHTML)
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:16px';
    const titleLabel = document.createElement('strong');
    titleLabel.style.color = '#f1f1f1';
    titleLabel.textContent = 'Video: ';
    titleDiv.appendChild(titleLabel);
    titleDiv.appendChild(document.createTextNode(title.substring(0, 50) + (title.length > 50 ? '...' : '')));
    overlay.appendChild(titleDiv);

    // Status indicator
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'background:#1a1a2e;border:1px solid #3b82f6;border-radius:8px;padding:16px;margin-bottom:16px;text-align:center';
    // Initial state using DOM methods
    updateStatus('⏳', 'Waiting for captions...', '#60a5fa', 'Turn CC OFF then ON again to capture');
    overlay.appendChild(statusDiv);

    // Language selector
    const langSection = document.createElement('div');
    langSection.style.cssText = 'margin-bottom:16px';

    const langLabel = document.createElement('div');
    langLabel.textContent = 'Language (for manual fetch):';
    langLabel.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:6px';

    const langSelect = document.createElement('select');
    langSelect.style.cssText = 'width:100%;padding:8px;background:#272727;color:#f1f1f1;border:1px solid #3f3f3f;border-radius:6px;font-size:13px;cursor:pointer';

    captions.forEach((track, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const isAuto = track.kind === 'asr';
        const label = track.name?.simpleText || track.languageCode;
        opt.textContent = label + (isAuto ? ' (auto-generated)' : '');
        // Default to English if available
        if (track.languageCode === 'en' && !isAuto) {
            opt.selected = true;
        }
        langSelect.appendChild(opt);
    });

    langSection.appendChild(langLabel);
    langSection.appendChild(langSelect);
    overlay.appendChild(langSection);

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;margin-bottom:12px';

    // Manual fetch button
    const fetchBtn = document.createElement('button');
    fetchBtn.textContent = 'Fetch Manually';
    fetchBtn.style.cssText = 'flex:1;padding:10px;background:#272727;color:#f1f1f1;border:1px solid #3f3f3f;border-radius:6px;font-size:14px;cursor:pointer';

    // Open app button (initially hidden)
    const openAppBtn = document.createElement('button');
    openAppBtn.textContent = 'Open App';
    openAppBtn.style.cssText = 'flex:1;padding:10px;background:#3ea6ff;color:#0f0f0f;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;display:none';

    btnRow.appendChild(fetchBtn);
    btnRow.appendChild(openAppBtn);
    overlay.appendChild(btnRow);

    // Help text
    const helpDiv = document.createElement('div');
    helpDiv.style.cssText = 'color:#6b7280;font-size:11px;text-align:center';
    helpDiv.textContent = 'If CC was already on, use "Fetch Manually" or toggle CC off then on.';
    overlay.appendChild(helpDiv);

    // Add overlay to page
    document.body.appendChild(overlay);

    // ========== CAPTURE HANDLER ==========
    function onTranscriptCaptured(rawJson, parsed) {
        capturedTranscript = rawJson;

        // Update status
        const textEvents = parsed.events?.filter(e => e.segs).length || 0;
        const sizeKB = (rawJson.length / 1024).toFixed(1);

        statusDiv.style.borderColor = '#22c55e';
        statusDiv.style.background = '#052e16';
        updateStatus('✅', 'Transcript Captured!', '#4ade80', textEvents + ' segments, ' + sizeKB + ' KB');

        // Copy to clipboard
        navigator.clipboard.writeText(rawJson).then(() => {
            const clipboardMsg = createEl('div', 'color:#4ade80;font-size:11px;margin-top:8px', '📋 Copied to clipboard');
            statusDiv.appendChild(clipboardMsg);
        }).catch(err => {
            const clipboardMsg = createEl('div', 'color:#fca5a5;font-size:11px;margin-top:8px', '⚠️ Clipboard copy failed');
            statusDiv.appendChild(clipboardMsg);
        });

        // Show open app button
        openAppBtn.style.display = 'block';
        fetchBtn.style.display = 'none';
    }

    // ========== MANUAL FETCH ==========
    fetchBtn.onclick = async function() {
        const selectedIndex = parseInt(langSelect.value);
        const track = captions[selectedIndex];

        if (!track || !track.baseUrl) {
            alert('No caption URL available for this language.');
            return;
        }

        fetchBtn.textContent = 'Fetching...';
        fetchBtn.disabled = true;

        try {
            const response = await fetch(track.baseUrl);
            const text = await response.text();

            if (text && text.length > 100) {
                const json = JSON.parse(text);
                if (json.events) {
                    onTranscriptCaptured(text, json);
                    return;
                }
            }

            throw new Error('Empty or invalid response');
        } catch (err) {
            statusDiv.style.borderColor = '#dc2626';
            statusDiv.style.background = '#450a0a';
            updateStatus('❌', 'Fetch failed', '#fca5a5', 'Try toggling CC on the video instead');

            fetchBtn.textContent = 'Fetch Manually';
            fetchBtn.disabled = false;
        }
    };

    // ========== OPEN APP ==========
    openAppBtn.onclick = function() {
        window.open('https://smartexpert.github.io/static-youtube-transcript/', '_blank');
    };

    // ========== START INTERCEPTION ==========
    installXHRInterceptor(onTranscriptCaptured);

})();
