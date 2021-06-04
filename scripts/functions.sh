#!/bin/bash

function serveQueue() {
    local queue_item
    
    while read -r queue_item
    do
      echo -e "HTTP/1.1 200 OK\n\n ${queue_item}" | ncat -l -p "${LISTEN_PORT:-1500}" >/dev/null
    done < <(
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
    local recycle_count
    local count

    fetch_url="${1:-FETCH_URL}"
    recycle_count="${2:-${RECYCLE_COUNT:-5000}}"

    if [[ -z "${fetch_url}" ]]; then
        echo "FETCH_URL cannot be empty" >&2
        return 252
    fi

    echo 0 > /dev/shm/itemscount
    
    while :
    do
        node src/scrape-cli.js --torrent-hashes-stdin-ln < <(
            ((count=0))
            while read -r fetched_item
            do
                if [[ -n "${fetched_item}" ]]
                then
                    echo "Got item ${fetched_item} [${count}/${recycle_count}]" >&2
                    echo "${fetched_item}"
                    ((count++))
                    echo "${count}" > /dev/shm/itemscount
                fi
            done < <( 
                while itemscount=$(</dev/shm/itemscount) && ((itemscount <= recycle_count))
                do
                    curl --silent "${fetch_url}"
                    ((count++))
                    sleep 1
                done
            )
        )
        sleep 30
    done


}