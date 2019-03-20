#!/usr/bin/env bash

DIR="$( basename "$PWD" )"

docker exec -it "$DIR"_server_1 /bin/bash
