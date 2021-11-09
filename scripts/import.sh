#! /bin/bash

if [[ -z "REDIS_HOST" ]]; then
    export REDIS_HOST=redis
fi

if [[ -z "$REDIS_PORT" ]]; then
    export REDIS_PORT=6379
fi

url=${1%/}
collection_type=$2

while read -r file_name
do
    echo "Adding ${file_name}"
    node --unhandled-rejections=strict src/add.js --torrent-url "${url}/${file_name}" --type "${collection_type}"
done < <(curl --silent -L "${url}" | grep -o "[a-zA-Z0-9./?=_%:-]*\.torrent" | sort -ru)
