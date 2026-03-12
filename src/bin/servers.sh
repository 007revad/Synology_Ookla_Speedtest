#!/usr/bin/env bash
#--------------------------------------------------------------------------
# Script to run speedtest-cli and get list of closest servers
#--------------------------------------------------------------------------

arch="$(uname -m)"

readarray -t servers  <<< "$(/var/packages/Synospeedtest/target/bin/$arch/speedtest --servers | tail +5)"

touch /var/packages/Synospeedtest/var/servers.list
for server in "${servers[@]}"; do
    #echo "DEBUG $server"
    echo "$server" >> /var/packages/Synospeedtest/var/servers.list
done
chmod 0755 /var/packages/Synospeedtest/var/servers.list

