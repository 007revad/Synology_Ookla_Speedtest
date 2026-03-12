document.addEventListener('DOMContentLoaded', () => {
    const optionSelect = document.getElementById('optionSelect');
    const runBtn = document.getElementById('runBtn');
    const status = document.getElementById('status');
    const output = document.getElementById('output');
    const systemInfo = document.getElementById('systemInfo');

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

        updateStatus('Starting SMART scan... Please wait.', 'warning');
        output.textContent = 'Initiating SMART scan...\nPlease wait up to 2 minutes.';
        setButtonsEnabled(false);

        callAPI('run', { option: selectedOption })
            .then(response => {
                if (response.success) {
                    updateStatus('Success: ' + response.message, 'success');

                    if (response.result && response.result.trim()) {
                        // Convert ANSI color codes to HTML style
                        const html = ansi_up.ansi_to_html(response.result);
                        output.innerHTML = html;
                    } else {
                        output.textContent = 'No SMART result data returned.';
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

    // Automatically load initial system information
    loadSystemInfo();
});
//
