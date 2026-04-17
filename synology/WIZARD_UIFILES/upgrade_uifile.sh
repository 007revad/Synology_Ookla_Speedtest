#!/bin/sh
if [ ! -f /var/packages/Synospeedtest/conf/privilege.elevated ]; then
    cat << 'EOF' > "${SYNOPKG_TEMP_LOGFILE}"
[{
    "step_title": "Permission setup required",
    "items": [{
        "desc": "After installation completes, you must create a sudoers file to grant the required permissions.<br><br>See the <a target=\"_blank\" href=\"https://github.com/007revad/Synology_Ookla_Speedtest/blob/main/set_package_permissions.md\">Set package permissions</a> for details."
    }]
}]
EOF
else
    echo "[]" > "${SYNOPKG_TEMP_LOGFILE}"
fi
exit 0
