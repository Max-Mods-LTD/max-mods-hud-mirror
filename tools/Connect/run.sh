#!/bin/sh
set -eu
IFS= read -r maxmods_node < /var/opt/maxmods-connect/node-path
case "$maxmods_node" in /*) ;; *) exit 1 ;; esac
exec "$maxmods_node" /var/opt/maxmods-connect/current/bridge.js "$@"
