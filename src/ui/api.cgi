#!/bin/bash

################################################################################################
# Syno Ookla Speedtest API - CGI API (generate_speedtest_result.sh Content internal integration)
################################################################################################

# --------- 1. Common variables and path calculations -------------

PKG_NAME="Synospeedtest"
PKG_ROOT="/var/packages/${PKG_NAME}"
PKG_VERSION=$(synopkg version "$PKG_NAME")
TARGET_DIR="${PKG_ROOT}/target"
LOG_DIR="${PKG_ROOT}/var"
LOG_FILE="${LOG_DIR}/api.log"
SERVERS_FILE="${LOG_DIR}/servers.list"
BIN_DIR="${TARGET_DIR}/bin"
RESULT_DIR="/usr/syno/synoman/webman/3rdparty/${PKG_NAME}/result"
RESULT_FILE="${RESULT_DIR}/speedtest.result"

SPEED_SCRIPT="${BIN_DIR}/speedtest.sh"
SERVERS_SCRIPT="${BIN_DIR}/servers.sh"

mkdir -p "${LOG_DIR}" "${RESULT_DIR}"

touch "${LOG_FILE}"
chmod 644 "${LOG_FILE}"
chmod 755 "${RESULT_DIR}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "${LOG_FILE}"
}

# --------- 3. HTTP header output --------------------------------

echo "Content-Type: application/json; charset=utf-8"
echo "Access-Control-Allow-Origin: *"
echo "Access-Control-Allow-Methods: GET, POST"
echo "Access-Control-Allow-Headers: Content-Type"
echo "" # Header/body separator blank line

# --------- 4. Parsing URL-encoded parameters --------------------

urldecode() { : "${*//+/ }"; echo -e "${_//%/\\x}"; }
declare -A PARAM
parse_kv() {
    local kv_pair key val
    IFS='&' read -ra kv_pair <<< "$1"
    for pair in "${kv_pair[@]}"; do
        IFS='=' read -r key val <<< "${pair}"
        key="$(urldecode "${key}")"
        val="$(urldecode "${val}")"
        PARAM["${key}"]="${val}"
    done
}

case "$REQUEST_METHOD" in
POST)
    CONTENT_LENGTH=${CONTENT_LENGTH:-0}
    if [ "$CONTENT_LENGTH" -gt 0 ]; then
        read -r -n "$CONTENT_LENGTH" POST_DATA
    else
        POST_DATA=""
    fi
    parse_kv "${POST_DATA}"
    ;;
GET)
    parse_kv "${QUERY_STRING}"
    ;;
*)
    log "Unsupported METHOD: ${REQUEST_METHOD}"
    echo '{"success":false,"message":"Unsupported METHOD","result":null}'
    exit 0
    ;;
esac

ACTION="${PARAM[action]}"
OPTION="${PARAM[option]}"
log "Request: ACTION=${ACTION}, OPTION=[${OPTION}]"

# --------- 5. JSON utility function -----------------------------

json_escape() {
    echo "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

json_response() {
    local ok="$1" msg="$2" data="$3"
    local msg_json=$(echo "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
    if [ -z "$data" ]; then
        echo "{\"success\":$ok, \"message\":$msg_json, \"result\":null}"
    else
        local data_json=$(json_escape "$data")
        echo "{\"success\":$ok, \"message\":$msg_json, \"result\":$data_json}"
    fi
}

clean_system_string() {
    local input="$1"
    input=$(echo "$input" | sed 's/ unknown//g; s/unknown //g; s/^unknown$//')
    input=$(echo "$input" | sed 's/  */ /g; s/^ *//; s/ *$//')
    if [ -z "$input" ] || [ "$input" = " " ]; then
        echo "N/A"
    else
        echo "$input"
    fi
}

get_system_info() {
    local model platform productversion build version smallfix

    model="$(cat /proc/sys/kernel/syno_hw_version 2>/dev/null || echo '')"
    platform="$(/bin/get_key_value /etc.defaults/synoinfo.conf platform_name 2>/dev/null || echo '')"
    productversion="$(/bin/get_key_value /etc.defaults/VERSION productversion 2>/dev/null || echo '')"
    build="$(/bin/get_key_value /etc.defaults/VERSION buildnumber 2>/dev/null || echo '')"

    # Fix dodgy characters after model number
    if [[ "${model,,}" =~ 'pv10-j'$ ]]; then
        model=${model%??????}+          # replace last 6 chars with +
    elif [[ "${model,,}" =~ '-j'$ ]]; then
        model=${model%??}               # remove last 2 chars
    fi

    if [ -n "$productversion" ] && [ -n "$build" ]; then
        version="${productversion}-${build}"
    else
        version=""
    fi

    smallfix="$(/bin/get_key_value /etc.defaults/VERSION smallfixnumber 2>/dev/null || echo '')"

    model="$(clean_system_string "$model")"
    platform="$(clean_system_string "$platform")"
    version="$(clean_system_string "$version")"
    smallfix="$(clean_system_string "$smallfix")"
    
    if [[ "$smallfix" -gt "0" ]]; then
        version="$version Update $smallfix"
    fi

    python3 -c "
import json
print(json.dumps({
'MODEL': '$model',
'PLATFORM': '$platform',
'DSM_VERSION': '$version',
'PKG_VERSION': '$PKG_VERSION'
}))"
}

# --------- 8. Action processing ---------------------------------

case "${ACTION}" in
info)
    log "[DEBUG] Getting system information"
    DATA="$(get_system_info)"
    json_response true "System information retrieved" "${DATA}"
    ;;

servers)
    # Run servers.sh and wait for it to finish (no & = foreground, no timeout race).
    # Redirect stdout+stderr away from the HTTP response body so nothing
    # pollutes the JSON we echo below.  servers.sh writes its own output to
    # SERVERS_FILE directly, so we only need to suppress noise here.
    # Use a generous timeout for slow ARM devices.
    log "[DEBUG] Fetching server list"
    timeout 120 sudo -u Synospeedtest "${SERVERS_SCRIPT}" > /dev/null 2>&1
    RET=$?
    if [ $RET -eq 124 ]; then
        log "[ERROR] servers.sh timed out after 120s"
        echo '{"success":false,"message":"Server list fetch timed out"}'
    elif [ $RET -ne 0 ]; then
        log "[ERROR] servers.sh failed with exit code $RET"
        echo '{"success":false,"message":"Server list fetch failed"}'
    elif [ -s "${SERVERS_FILE}" ]; then
        log "[DEBUG] Server list updated successfully"
        echo '{"success":true,"message":"Server list updated"}'
    else
        log "[ERROR] servers.sh completed but servers.list is empty"
        echo '{"success":false,"message":"Server list empty after fetch"}'
    fi
    ;;

getservers)
    if [ -f "${SERVERS_FILE}" ] && [ -s "${SERVERS_FILE}" ]; then
        content=$(cat "${SERVERS_FILE}")
        json_content=$(python3 -c "
import json, sys
data = sys.stdin.read()
print(json.dumps(data))
" <<< "$content")
        echo "{\"success\":true,\"result\":${json_content}}"
    else
        echo '{"success":false,"message":"servers.list not found or empty"}'
    fi
    ;;

run)
    if [[ "${OPTION}" =~ ^[0-9]? ]]; then
        ID="${OPTION}"
        OPTION=""
    fi
    
    case "${OPTION}" in
        "-v"|"-h")
            # Run immediately without waiting for Finished + output
            if [ ! -x "${SPEED_SCRIPT}" ]; then
                json_response false "Speedtest script not found or not executable" ""
                log "[ERROR] Speedtest script not found or not executable"
                exit 0
            fi
    
            TMP_RESULT="${RESULT_FILE}.tmp"
            TMP_STDERR="${LOG_DIR}/last_speedtest_stderr.log"
            rm -f "$TMP_RESULT" "$TMP_STDERR"
    
            timeout 30 sudo -u Synospeedtest "${SPEED_SCRIPT}" "$OPTION" > "$TMP_RESULT" 2> "$TMP_STDERR"
            sleep 0.3  # Wait about 300ms
            RET=$?
    
            if [ $RET -eq 0 ] && [ -s "$TMP_RESULT" ]; then
                mv "$TMP_RESULT" "${RESULT_FILE}"
                chmod 644 "${RESULT_FILE}"
                SPEED_RESULT="$(cat "${RESULT_FILE}")"
                json_response true "Speedtest script output" "$SPEED_RESULT"
            else
                LAST_ERROR=$(python3 -c "
import json, sys, re
try:
    with open('${TMP_STDERR}') as f:
        lines = f.readlines()[-20:]
    text = ''.join(lines)[:2000].strip()
    text = re.sub(r'  This incident will be reported\.', '', text)
    text = text.rstrip()
    if 'not in the sudoers file' in text:
        text += '\n\nSee https://github.com/007revad/Synology_Ookla_Speedtest/blob/main/set_package_permissions.md'
except Exception:
    text = ''
print(json.dumps(text if text else 'Unknown error or no error output'))
")
                MSG_JSON=$(echo "Speedtest script failed" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
                echo "{\"success\":false, \"message\":${MSG_JSON}, \"result\":${LAST_ERROR}}"
                log "[ERROR] Speedtest script failed"
            fi
            ;;
        ""|"-a"|"-i")
            # Existing Finished waiting loop method
            if [ ! -x "${SPEED_SCRIPT}" ]; then
                json_response false "Speedtest script not found or not executable" ""
                log "[ERROR] Speedtest script not found or not executable"
                exit 0
            fi
    
            TMP_RESULT="${RESULT_FILE}.tmp"
            TMP_STDERR="${LOG_DIR}/last_speedtest_stderr.log"
            rm -f "$TMP_RESULT" "$TMP_STDERR"
    
            if [ -n "$OPTION" ]; then
                timeout 240 sudo -u Synospeedtest "${SPEED_SCRIPT}" "$OPTION" > "$TMP_RESULT" 2> "$TMP_STDERR" &
            elif [[ "$ID" =~ ^[0-9]+$ ]]; then
                # Only pass ID when it is a non-empty string of digits
                timeout 240 sudo -u Synospeedtest "${SPEED_SCRIPT}" "$ID" > "$TMP_RESULT" 2> "$TMP_STDERR" &
            else
                timeout 240 sudo -u Synospeedtest "${SPEED_SCRIPT}" > "$TMP_RESULT" 2> "$TMP_STDERR" &
            fi
            CMD_PID=$!
    
            i=0
            while [ $i -lt 240 ]; do
                if grep -q "Result URL" "$TMP_RESULT" 2>/dev/null; then
                    break
                fi
                if ! kill -0 $CMD_PID 2>/dev/null; then
                    # Process exited - give it a moment to flush output then stop waiting
                    sleep 2
                    break
                fi
                sleep 1
                i=$((i+1))
            done
    
            # Reap the child (no-op if already gone)
            if kill -0 $CMD_PID 2>/dev/null; then
                kill $CMD_PID 2>/dev/null
            fi
            wait $CMD_PID 2>/dev/null
    
            if grep -q "Result URL" "$TMP_RESULT" 2>/dev/null; then
                mv "$TMP_RESULT" "${RESULT_FILE}"
                chmod 644 "${RESULT_FILE}"
                SPEED_RESULT="$(cat "${RESULT_FILE}")"
                RESULT_URL="$(grep -oP 'https://www\.speedtest\.net/result/c/[0-9a-f-]+' "${RESULT_FILE}" | head -1)"
                RESULT_URL_JSON=$(echo "$RESULT_URL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
                DATA_JSON=$(json_escape "$SPEED_RESULT")
                MSG_JSON=$(echo "Speed Test completed" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
                echo "{\"success\":true, \"message\":${MSG_JSON}, \"result\":${DATA_JSON}, \"result_url\":${RESULT_URL_JSON}}"
            else
                LAST_ERROR=$(python3 -c "
import json, sys, re
try:
    with open('${TMP_STDERR}') as f:
        lines = f.readlines()[-20:]
    text = ''.join(lines)[:2000].strip()
    text = re.sub(r'  This incident will be reported\.', '', text)
    text = text.rstrip()
    if 'not in the sudoers file' in text:
        text += '\n\nSee https://github.com/007revad/Synology_Ookla_Speedtest/blob/main/set_package_permissions.md'
except Exception:
    text = ''
print(json.dumps(text if text else 'Unknown error or no error output'))
")
                MSG_JSON=$(echo "Speed Test failed" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')
                echo "{\"success\":false, \"message\":${MSG_JSON}, \"result\":${LAST_ERROR}}"
                log "[ERROR] Speed Test failed"
            fi
            ;;
        *)
            json_response false "Invalid option: ${OPTION}" ""
            exit 0
            ;;
        esac
        ;;
*)
    log "[ERROR] Invalid action: ${ACTION}"
    json_response false "Invalid action: ${ACTION}" ""
    ;;
esac

exit 0
