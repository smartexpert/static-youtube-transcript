/**
 * YouTube Transcript Extractor Bookmarklet
 *
 * This bookmarklet helps users extract transcript JSON from YouTube videos.
 * Due to YouTube's security headers, we can't fetch the transcript directly,
 * so this provides a helper UI for copying from DevTools Network tab.
 *
 * Usage:
 * 1. Go to a YouTube video page
 * 2. Click the bookmarklet
 * 3. Follow the instructions to copy transcript JSON from DevTools
 * 4. Paste into the helper, validate, and copy
 * 5. Paste into the YouTube Transcript Cleaner app
 *
 * To minify for bookmarklet use:
 * 1. Remove comments and extra whitespace
 * 2. URL-encode # as %23 and % as %25 in style strings
 * 3. Prefix with "javascript:"
 */

(function() {
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

    // Method 1: Check global variable
    if (window.ytInitialPlayerResponse) {
        playerResponse = window.ytInitialPlayerResponse;
    }

    // Method 2: Could also search in script tags if needed

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

    // Create overlay UI
    const overlay = document.createElement('div');
    overlay.id = 'yt-transcript-extractor';
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;background:#0f0f0f;color:#f1f1f1;padding:20px;border-radius:12px;z-index:999999;max-width:520px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid #272727;max-height:90vh;overflow-y:auto';

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

    // Video title section
    const titleSection = document.createElement('div');
    titleSection.style.marginBottom = '12px';

    const titleLabel = document.createElement('div');
    titleLabel.textContent = 'Video';
    titleLabel.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:4px';

    const titleValue = document.createElement('div');
    titleValue.textContent = title;
    titleValue.style.cssText = 'color:#f1f1f1;font-weight:500';

    titleSection.appendChild(titleLabel);
    titleSection.appendChild(titleValue);
    overlay.appendChild(titleSection);

    // Language selector
    const langSection = document.createElement('div');
    langSection.style.marginBottom = '16px';

    const langLabel = document.createElement('div');
    langLabel.textContent = 'Language';
    langLabel.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:6px';

    const langSelect = document.createElement('select');
    langSelect.style.cssText = 'width:100%;padding:10px;background:#272727;color:#f1f1f1;border:1px solid #3f3f3f;border-radius:6px;font-size:14px;cursor:pointer';

    captions.forEach((track, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        const isAuto = track.kind === 'asr';
        const label = track.name?.simpleText || track.languageCode;
        opt.textContent = label + (isAuto ? ' (auto-generated)' : '');
        langSelect.appendChild(opt);
    });

    langSection.appendChild(langLabel);
    langSection.appendChild(langSelect);
    overlay.appendChild(langSection);

    // Instructions
    const instructDiv = document.createElement('div');
    instructDiv.style.cssText = 'background:#1a1a2e;border:1px solid #3f3f3f;border-radius:6px;padding:12px;margin-bottom:16px';

    const instructTitle = document.createElement('div');
    instructTitle.textContent = 'Instructions:';
    instructTitle.style.cssText = 'color:#fbbf24;font-weight:600;margin-bottom:8px';
    instructDiv.appendChild(instructTitle);

    const steps = [
        '1. Open DevTools (F12 or Cmd+Option+I)',
        '2. Go to Network tab',
        '3. Filter by "timedtext"',
        '4. Click "Show transcript" on the video',
        '5. Click the timedtext request → Response tab',
        '6. Copy the JSON and paste below'
    ];

    steps.forEach(step => {
        const stepDiv = document.createElement('div');
        stepDiv.textContent = step;
        stepDiv.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:4px';
        instructDiv.appendChild(stepDiv);
    });

    overlay.appendChild(instructDiv);

    // Paste area
    const pasteLabel = document.createElement('div');
    pasteLabel.textContent = 'Paste JSON here:';
    pasteLabel.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:6px';
    overlay.appendChild(pasteLabel);

    const pasteArea = document.createElement('textarea');
    pasteArea.placeholder = 'Paste the timedtext JSON response here...';
    pasteArea.style.cssText = 'width:100%;height:100px;background:#1a1a1a;color:#4ade80;border:1px solid #3f3f3f;border-radius:6px;padding:10px;font-family:monospace;font-size:11px;resize:vertical;box-sizing:border-box;margin-bottom:12px';
    overlay.appendChild(pasteArea);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px';

    const validateBtn = document.createElement('button');
    validateBtn.textContent = 'Validate & Format';
    validateBtn.style.cssText = 'flex:1;padding:10px;background:#272727;color:#f1f1f1;border:1px solid #3f3f3f;border-radius:6px;font-size:14px;cursor:pointer';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy JSON';
    copyBtn.style.cssText = 'flex:1;padding:10px;background:#3ea6ff;color:#0f0f0f;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer';

    btnRow.appendChild(validateBtn);
    btnRow.appendChild(copyBtn);
    overlay.appendChild(btnRow);

    // Status display
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'margin-top:12px;padding:10px;border-radius:6px;font-size:12px;display:none';
    overlay.appendChild(statusDiv);

    // Add overlay to page
    document.body.appendChild(overlay);

    // Validate button handler
    validateBtn.onclick = function() {
        try {
            const json = JSON.parse(pasteArea.value);
            const formatted = JSON.stringify(json, null, 2);
            pasteArea.value = formatted;

            const events = json.events || [];
            const segments = events.filter(e => e.segs).length;

            statusDiv.style.display = 'block';
            statusDiv.style.background = '#052e16';
            statusDiv.style.border = '1px solid #22c55e';
            statusDiv.style.color = '#4ade80';
            statusDiv.textContent = 'Valid JSON: ' + events.length + ' events, ' + segments + ' with text, ' + (formatted.length / 1024).toFixed(1) + ' KB';
        } catch (e) {
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#450a0a';
            statusDiv.style.border = '1px solid #dc2626';
            statusDiv.style.color = '#fca5a5';
            statusDiv.textContent = 'Invalid JSON: ' + e.message;
        }
    };

    // Copy button handler
    copyBtn.onclick = function() {
        if (!pasteArea.value.trim()) {
            alert('Nothing to copy');
            return;
        }
        navigator.clipboard.writeText(pasteArea.value).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.style.background = '#22c55e';
            setTimeout(() => {
                copyBtn.textContent = 'Copy JSON';
                copyBtn.style.background = '#3ea6ff';
            }, 2000);
        }).catch(err => {
            alert('Failed to copy: ' + err.message);
        });
    };
})();
