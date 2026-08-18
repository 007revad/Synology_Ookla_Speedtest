document.addEventListener('DOMContentLoaded', () => {
    const optionSelect = document.getElementById('optionSelect');
    const runBtn = document.getElementById('runBtn');
    const status = document.getElementById('status');
    const output = document.getElementById('output');
    const toggleBtn = document.getElementById('toggleBtn');

    // Toggle state: 'image' or 'text'
    let viewMode = 'image';
    let storedImgHtml = '';
    let storedTextHtml = '';

    toggleBtn.addEventListener('click', () => {
        if (viewMode === 'image') {
            viewMode = 'text';
            output.innerHTML = storedTextHtml;
            toggleBtn.textContent = 'Show Image';
        } else {
            viewMode = 'image';
            output.innerHTML = storedImgHtml;
            toggleBtn.textContent = 'Show Text';
        }
    });

    // Creating an ansi_up instance 
    const ansi_up = new AnsiUp();

    // System information parsing function (same as before)
    function parseSystemInfo(data) {
        if (!data) return {};
        const info = {};
        data.split('\n').forEach(line => {
            const colonIndex = line.indexOf(': ');
            if (colonIndex !== -1) {
                const key = line.substring(0, colonIndex).trim();
                const value = line.substring(colonIndex + 2).trim();
                info[key] = value;
            }
        });
        return info;
    }

    // API call function (same as before)
    function callAPI(action, params = {}) {
        const urlParams = new URLSearchParams();
        urlParams.append('action', action);
        Object.keys(params).forEach(key => urlParams.append(key, params[key]));

        return fetch('api.cgi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: urlParams.toString()
        })
        .then(res => {
            if (!res.ok) throw new Error('Network response was not ok');
            return res.json();
        });
    }

    // State update function (same as before)
    function updateStatus(message, type = 'info') {
        status.textContent = message;
        status.className = 'status ' + type;
    }

    // Button state management
    function setButtonsEnabled(enabled) {
        runBtn.disabled = !enabled;
        optionSelect.disabled = !enabled;
    }

    // Modify RUN button event handler: Output after converting ANSI -> HTML
    runBtn.addEventListener('click', () => {
        const selectedOption = optionSelect.value;

        updateStatus('Starting Speed Test...', 'warning');
        output.innerHTML = `
            <div id="loading" style="display:flex; align-items:center; justify-content:center; gap:12px; padding:20px;">
                <img src="images/wait_triangle_blue_40p.gif" alt="" width="40" height="40">
                <span>Running Speed Test... Please wait up to 1 minute.</span>
            </div>
        `;
        toggleBtn.style.display = 'none';
        setButtonsEnabled(false);

        callAPI('run', { option: selectedOption })
            .then(response => {
                if (response.success) {
                    if (response.alerts && response.alerts.length > 0) {
                        updateStatus(response.alerts.join('\n'), 'error');
                    } else {
                        updateStatus('Success: ' + response.message, 'success');
                    }

                    if (response.result && response.result.trim()) {
                        storedTextHtml = `<pre>${ansi_up.ansi_to_html(response.result)}</pre>`;

                        if (response.result_url) {
                            const imgUrl  = response.result_url + '.png';
                            const pageUrl = response.result_url;
                            storedImgHtml = `<div class="speedtest-result-img">` +
                                                `<a href="${pageUrl}" target="_blank" rel="noopener">` +
                                                    `<img src="${imgUrl}" alt="Speedtest Result">` +
                                                `</a>` +
                                            `</div>`;
                            // Default to image view
                            viewMode = 'image';
                            output.innerHTML = storedImgHtml;
                            toggleBtn.textContent = 'Show Text';
                            toggleBtn.style.display = 'inline-block';
                        } else {
                            // No image available, just show text
                            storedImgHtml = '';
                            viewMode = 'text';
                            output.innerHTML = storedTextHtml;
                            toggleBtn.style.display = 'none';
                        }
                    } else {
                        output.textContent = 'No Speed Test results returned.';
                        toggleBtn.style.display = 'none';
                    }
                } else {
                    updateStatus('Failed: ' + response.message, 'error');
                    // Show the actual stderr error if present, otherwise fall back to the message
                    const errText = (response.result && response.result.trim())
                        ? response.result.trim()
                        : response.message;
                    // Render error as HTML with clickable links
                    const errHtml = errText
                        .split('\n')
                        .map(line => {
                            const urlMatch = line.match(/^(See )?(https?:\/\/\S+)$/);
                            if (urlMatch) {
                                const prefix = urlMatch[1] || '';
                                const url = urlMatch[2];
                                return `${prefix}<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
                            }
                            return line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                        })
                        .join('\n');
                    // output.innerHTML = `<pre>${errHtml}</pre>`;
                    output.innerHTML = errHtml.replace(/\n/g, '<br>');
                    toggleBtn.style.display = 'none';
                }
            })
            .catch(error => {
                console.error('Run command error:', error);
                updateStatus('Error: ' + error.message, 'error');
                output.textContent = 'Error occurred: ' + error.message;
            })
            .finally(() => {
                setButtonsEnabled(true);
            });
    });

    // Load servers into dropdown
    async function loadServers() {
        const select = document.getElementById('optionSelect');
        // Show loading placeholder
        const loading = document.createElement('option');
        loading.disabled = true;
        loading.textContent = 'Loading server list...';
        select.appendChild(loading);

        try {
            // Run servers.sh to populate servers.list first
            const serversResponse = await callAPI('servers');
            if (!serversResponse.success) {
                throw new Error(serversResponse.message || 'Failed to fetch server list');
            }

            const data = await callAPI('getservers');

            // Remove placeholder
            if (select.contains(loading)) select.removeChild(loading);
            if (!data.success) throw new Error(data.message);

            if (!data.success) throw new Error(data.message);

            const lines = data.result.split('\n').filter(line => line.trim() !== '');

            lines.forEach(line => {
                const id = line.slice(0, 6).trim();
                if (!id) return;

                const name    = line.slice(6, 36).trim();
                const city    = line.slice(36, 56).trim();
                const country = line.slice(56).trim();

                const option = document.createElement('option');
                option.value = id;
                option.textContent = `${name} - ${city}, ${country}`;
                select.appendChild(option);
            });

        } catch (err) {
            console.error('Failed to load servers:', err);
            if (select.contains(loading)) select.removeChild(loading);
            const option = document.createElement('option');
            option.disabled = true;
            option.textContent = '⚠ Could not load server list';
            select.appendChild(option);
        }
    }

    // Load dropdown list with local servers
    loadServers();

    // Log page open/refresh in api.log
    callAPI('init');
});

