<?php
header('Content-Type: text/plain');
$file = '/var/packages/Synospeedtest/var/servers.list';
if (file_exists($file)) {
    readfile($file);
} else {
    http_response_code(404);
    echo 'servers.list not found';
}
