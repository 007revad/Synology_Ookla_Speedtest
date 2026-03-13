#!/usr/bin/env bash
#--------------------------------------------------------------------------
# Script to run speedtest-cli and get list of closest servers 
#--------------------------------------------------------------------------

arch="$(uname -m)"
/var/packages/Synospeedtest/target/bin/$arch/speedtest --servers 2>/dev/null \
    | tail -n +5 \
    > /var/packages/Synospeedtest/var/servers.list
chmod 0666 /var/packages/Synospeedtest/var/servers.list
chown Synospeedtest:Synospeedtest /var/packages/Synospeedtest/var/servers.list

