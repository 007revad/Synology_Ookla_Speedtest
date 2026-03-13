document.addEventListener('DOMContentLoaded', () => {
    const optionSelect = document.getElementById('optionSelect');
    const runBtn = document.getElementById('runBtn');
    const status = document.getElementById('status');
    const output = document.getElementById('output');
    const systemInfo = document.getElementById('systemInfo');
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

    // System information load function (same as before)
    function loadSystemInfo() {
        systemInfo.innerHTML = '<span style="color: #0066cc;">Loading system information...</span>';

        callAPI('info')
            .then(data => {
                if (data.success) {
                    let infoObj = {};
                    try {
                        infoObj = JSON.parse(data.result);
                    } catch (e) {
                        console.error('Failed to parse system info:', e);
                    }
                    systemInfo.innerHTML = `
                        <strong>MODEL:</strong> <span>${infoObj.MODEL || 'N/A'}</span>
                        <strong>PLATFORM:</strong> <span>${infoObj.PLATFORM || 'N/A'}</span>
                        <strong>DSM_VERSION:</strong> <span>${infoObj.DSM_VERSION || 'N/A'}</span>
                        <strong>Update:</strong> <span>${infoObj.Update || 'N/A'}</span>
                    `;
                } else {
                    systemInfo.innerHTML = `<span style="color: red;">Failed to load system information: ${data.message || 'Unknown error'}</span>`;
                }
            })
            .catch(error => {
                systemInfo.innerHTML = `<span style="color: red;">Error loading system information: ${error.message}</span>`;
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

        updateStatus('Starting Speed Test... Please wait.', 'warning');
        output.textContent = 'Initiating Speed Test...\nPlease wait up to 1 minute.';
        toggleBtn.style.display = 'none';
        setButtonsEnabled(false);

        callAPI('run', { option: selectedOption })
            .then(response => {
                if (response.success) {
                    updateStatus('Success: ' + response.message, 'success');

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
                    output.textContent = 'Error: ' + response.message;
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
            await callAPI('servers');

            const data = await callAPI('getservers');
            // Remove placeholder
            select.removeChild(loading);

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
            select.removeChild(loading);
            const option = document.createElement('option');
            option.disabled = true;
            option.textContent = '⚠ Could not load server list';
            select.appendChild(option);
        }
    }

    // Automatically load initial system information
    loadSystemInfo();

    // Load dropdown list with local servers
    loadServers();
});

