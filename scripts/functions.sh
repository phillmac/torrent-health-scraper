#!/bin/bash

function serveQueue() {
    local queue_item
    
    while read -r  queue_item
    do
      echo -e "HTTP/1.1 200 OK\n\n ${queue_item}" | ncat -l -p "${LISTEN_PORT:-1500}"
    done <  <( 
        while :
        do
            echo "Fetching stale list" >&2
            node src/stale.js
            sleep 1
        done
    )
}


function runWorker () {
    local fetched_item
    local fetch_url

    fetch_url="${1:-FETCH_URL}"

    if [[ -z "${fetch_url}" ]]; then
        echo "FETCH_URL cannot be empty" >&2
        return 252
    fi

    node src/scrape-cli.js --torrent-hashes-stdin-ln < <(
        while read -r fetched_item
        do
            if [[ -n "${fetched_item}" ]]
            then
                echo "Got item ${fetched_item}" >&2
                echo "${fetched_item}"
            fi
        done < <( 
            while :
            do
                curl --silent "${fetch_url}"
                sleep 1
            done
        )
    )

}