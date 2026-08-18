#!/usr/bin/env bash
# shellcheck disable=SC2001
#--------------------------------------------------------------------------
# Script to run speedtest-cli and provide a cleaner output
#
# Requirements:
#   - GNU bash (does not work in BusyBox)
#   - Script must be run as sudo or root
#--------------------------------------------------------------------------
# Ookla speedtest-cli options 
# https://gist.github.com/itsChris/6f7a5d59b408f0cb774bf2570137a0ef
#--------------------------------------------------------------------------

# Optionally set you preferred Ookla server's id number
id=

#--------------------------------------------------------------------------

#scriptname=speedtest
pkgname=OoklaSpeedtest

if [[ -z "$id" && -n "$1" ]]; then
    id="$1"
fi

arch="$(uname -m)"

# Get DSM major version
#dsm=$(/usr/syno/bin/synogetkeyvalue /etc.defaults/VERSION majorversion)

# Set log path
# DSM 7: var/ exists and is writable by pkgname (run-as: package)
# DSM 6: var/ doesn't exist; use etc/ (chmod 666 set in postinst)
if [[ -d "/var/packages/${pkgname}/var" ]]; then
    logpath="/var/packages/${pkgname}/var/"
else
    logpath="/var/packages/${pkgname}/etc/"
fi
logfile="$logpath/last_speedtest_result.log"

is_schedule_running(){ 
    # $1 is script's filename. e.g. speedtest.sh etc
    local file="/usr/syno/etc/esynoscheduler/esynoscheduler.db"
    local rows offset task status pid result

    # Get number of rows in database
    rows=$(sqlite3 "${file}" <<ECNT
SELECT COUNT(*) from task;
.quit
ECNT
)
    # Check if script is running from task scheduler
    offset="0"
    while [[ $rows != "$offset" ]]; do
        task=$(sqlite3 "$file" "SELECT operation FROM task WHERE rowid = (SELECT rowid FROM task LIMIT 1 OFFSET ${offset});")
        if echo "$task" | grep -q "$1"; then
            status=$(sqlite3 "$file" "SELECT status FROM task WHERE rowid = (SELECT rowid FROM task LIMIT 1 OFFSET ${offset});")
            pid=$(echo "$status" | cut -d"[" -f2 | cut -d"]" -f1)
            if [[ $pid -gt "0" ]]; then
                result=$((result +pid))
            fi
        fi
        offset=$((offset +1))
    done
    [ -n "$result" ] || return 1
}

# Display the full Bash version string
#echo "Bash version is: $BASH_VERSION"  # debug ################################

# Check script is running as root
#if [[ $( whoami ) != "root" ]]; then
#    printf \\a  # Make error sound
#    echo -e "ERROR This script must be run as sudo or root!"
#    exit 1
#fi

# If running on Synology check if running from a scheduled task
#if [[ -f /etc/synoinfo.conf ]]; then
#    #if is_schedule_running "$(basename -- "$0")"; then
#    if is_schedule_running "${scriptname}.sh"; then
#        # Running from Synology task scheduler
#        scheduled="yes"
#    fi
#fi

# Get script location
# https://stackoverflow.com/questions/59895/
source=${BASH_SOURCE[0]}
while [ -L "$source" ]; do # Resolve $source until the file is no longer a symlink
    scriptpath=$( cd -P "$( dirname "$source" )" >/dev/null 2>&1 && pwd )
    source=$(readlink "$source")
    # If $source was a relative symlink, we need to resolve it
    # relative to the path where the symlink file was located
    [[ $source != /* ]] && source=$scriptpath/$source
done
scriptpath=$( cd -P "$( dirname "$source" )" >/dev/null 2>&1 && pwd )

# Check if binary for arch exists in same folder as script
if [[ -f "${scriptpath}/${arch}/speedtest" ]]; then
    # speedtest binary exists in same folder as script
    speedtest="${scriptpath}/${arch}/speedtest"
elif [[ -f "${scriptpath}/bin/${arch}/speedtest" ]]; then
    # speedtest binary exists in bin
    speedtest="${scriptpath}/bin/${arch}/speedtest"
else
    printf \\a  # Make error sound
    echo -e "ERROR speedtest binary not found in: "
    echo -e "  ${scriptpath}/${arch}/speedtest"
    echo -e "  ${scriptpath}/bin/${arch}/speedtest"
    exit 1
fi

# tr '\r' '\n' replaces \r with \n
# tr -s '\n' (squeeze option) replaces multiple \n into a single \n
# < <() Redirection does not work on Asustor with the Netdata app's GNU bash 4.4
# <<< here-string works on Asustor with the Netdata app's GNU bash 4.4
if [[ -n "$id" ]]; then
    # id variable for server-id is set
    #readarray -t speed_array_tmp <<< "$(docker run -t gists/speedtest-cli speedtest --server-id="$id" --progress=no --accept-license | tr '\r' '\n' | tr -s '\n' | sed '/^[[:space:]]*$/d')"
    readarray -t speed_array_tmp <<< "$("$speedtest" --server-id="$id" --progress=no --accept-license --accept-gdpr | tr '\r' '\n' | tr -s '\n' | sed '/^[[:space:]]*$/d')"
else
    #readarray -t speed_array_tmp <<< "$(docker run -t gists/speedtest-cli speedtest --progress=no --accept-license | tr '\r' '\n' | tr -s '\n' | sed '/^[[:space:]]*$/d')"
    readarray -t speed_array_tmp <<< "$("$speedtest" --progress=no --accept-license --accept-gdpr | tr '\r' '\n' | tr -s '\n' | sed '/^[[:space:]]*$/d')"
fi

# Strip license header from array
for line in "${speed_array_tmp[@]}"; do
    if [[ "$line" =~ Ookla || "$header_done" == "yes" ]]; then
        speed_array+=("$line")
        header_done="yes"
    fi
done

log_result(){ 
    speed="${1%.*}"  # strip decimal places
    local last_speed
    local type="$2"  # download or upload
    local last_speed
    last_speed="$(/usr/syno/bin/synogetkeyvalue "$logfile" "$type")"

    if [[ -n "$last_speed" && "$last_speed" -gt 0 && "$speed" -lt "$last_speed" ]]; then
        local drop_threshold=20  # alert if speed drops by this % or more vs last run
        local drop_pct=$(( (last_speed - speed) * 100 / last_speed ))

        if [[ "$drop_pct" -ge "$drop_threshold" ]]; then
            alert="ALERT: $type speed dropped ${drop_pct}% (was ${last_speed} Mbps, now ${speed} Mbps) on $(hostname)"
            alert_array+=("$alert")
        fi
    fi

    # Flag results that look capped at a standard Ethernet tier ceiling
    # (catches link renegotiation issues even with no prior baseline, or on the very first bad run)
    if [[ "$type" == "download" ]]; then
        local tiers=(25000 10000 5000 2500 1000 100 10)
        for t in "${tiers[@]}"; do
            if [[ "$speed" -le "$t" ]]; then
                # speed sits at/under this tier - check it's not suspiciously close to the ceiling
                local tier_margin=$(( t * 90 / 100 ))  # within 10% of tier ceiling from below
                if [[ "$speed" -ge "$tier_margin" && "$t" -lt 10000 ]]; then
                    alert="ALERT: $type speed (${speed} Mbps) looks capped near the ${t} Mbps Ethernet tier on $(hostname) - possible link negotiation issue"
                    alert_array+=("$alert")
                fi
                break
            fi
        done
    fi

    # Set download or upload speed in log
    /usr/syno/bin/synosetkeyvalue "$logfile" "$type" "$speed"
}

for line in "${speed_array[@]}"; do
    if [[ "${line}" =~ "Ookla" ]]; then
        if [[ ! $scriptpath =~ OoklaSpeedtest ]]; then
            echo -e "\n"
        fi
        #if [[ $scheduled == "yes" ]]; then
        #    echo -e "$line\n"
        #else
            echo -e "$line - running on $( hostname )\n"
        #fi
    elif [[ "${line}" =~ "URL:" ]]; then
        echo
        echo "$line" | cut -d":" -f1
        echo -n " "
        echo "$line" | cut -d":" -f2-
    elif [[ "${line}" =~ ": " ]]; then
        if [[ "${line}" =~ "Download:" ]]; then
            download="$(echo "$line" | awk '{print $2}')"
            log_result "$download" download
        elif [[ "${line}" =~ "Upload:" ]]; then
            upload="$(echo "$line" | awk '{print $2}')"
            log_result "$upload" upload
        else
            # Remove trailing whitespace
            echo "$line" | sed -e 's/[[:space:]]*$//'
        fi
    fi
done

#echo -e "\nLines in array: ${#speed_array[@]}\n"  # debug #####################

if [[ ${#alert_array[@]} -gt "0" ]]; then
    echo ""
    for i in "${alert_array[@]}"; do
        echo "$i"
    done
fi

#if [[ $scheduled == "yes" ]]; then
if [[ ! $scriptpath =~ OoklaSpeedtest ]]; then
    echo -e " \n \n"
else
    echo
fi

if [[ ${#alert_array[@]} -gt "0" ]]; then exit 1; fi
