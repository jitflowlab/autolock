#!/usr/bin/env bash

DIR="$( basename "$PWD" )"

docker exec -it "$DIR"_manager_1 /bin/bash
