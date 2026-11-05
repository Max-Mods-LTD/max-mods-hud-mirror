#!/bin/sh
set -eu
IFS= read -r maxmods_video_node < /var/opt/maxmods-video/node-path
case "$maxmods_video_node" in /*) ;; *) exit 1 ;; esac
exec "$maxmods_video_node" /var/opt/maxmods-video/current/engine.js serve
