const config = require("./config.json");

const playlistItems = [];

// return console.log(2 * (24 * 60 * 60 * 1000) / config.monitorInterval); // Check how much quota will be used every 24 hours
// return trigger(); // Test what happens when a video is uploaded

let checks = 0;
(async function main() {
    console.log("Checking channel...");
    await updateChannel().catch(err => {
        console.log("Failed to check channel:", err);
    });
    console.log(`(${++checks}) Waiting ${config.monitorInterval}ms...`);
    setTimeout(main, config.monitorInterval);
})();

function trigger(videoId = "fakeid") {
    console.log(`New video: ${videoId}`);

    // Spam Discord
    (async function sendNotifications(times = 1) {
        await sendNotification(config.log.replace(/{videoId}/g, videoId)).catch(err => {
            console.log("Failed to send notification:", err);
        });
        if (times < config.notifications) setTimeout(() => sendNotifications(times + 1), config.notificationDelay);
    })();

    // Fuck up Home Assistant stuff
    for (const { domain, service, entityId, params, log } of config.homeAssistantTriggers) {
        homeAssistantServices(domain, service, entityId, params).then(() => {
            if (log) sendNotification(log).catch(err => { });
        }).catch(err => console.log(`Failed to send ${service} to ${domain}:`, err));
    }
}

async function updateChannel() {
    const playlistId = config.playlistId || await getChannelDetails().then(i => i.items[0].contentDetails.relatedPlaylists.uploads);
    const playlist = await getPlaylist(playlistId);
    
    if (!playlistItems.length) playlistItems.push(...playlist.items.map(i => i.contentDetails));

    for (const item of playlist.items) {
        const { contentDetails } = item;
        if (!playlistItems.find(i => i.videoId === contentDetails.videoId)) {
            // New video found
            playlistItems.unshift(contentDetails);

            // Trigger mayhem
            trigger(contentDetails.videoId);
        }
    }
};

async function homeAssistantServices(domain, service, entityId, params = { }) {
    return fetch(`${config.homeAssistantBaseUrl}/api/services/${domain}/${service}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.homeAssistantApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            entity_id: entityId,
            ...(params || { })
        })
    }).then(res => {
        if (!res.ok) throw new Error(`Got status ${res.status} (${res.statusText})`);
    });
}

async function googleApi(path, params = { }) {
    // 10000 quota units per day
    const urlSearchParams = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(i => i[1] !== undefined)));
    urlSearchParams.set("key", config.googleApiKey);

    return fetch(`https://www.googleapis.com/youtube/v3${path}?${urlSearchParams.toString()}`).then(res => {
        if (!res.ok) throw new Error(`Got status ${res.status} (${res.statusText})`);
        return res.json();
    });
}

function getChannelDetails() {
    // 1 quota unit
    return googleApi("/channels", {
        part: "contentDetails",
        forHandle: config.channelHandle,
        forUsername: config.channelUsername,
        id: config.channelId,
    });
}

function getPlaylist(id) {
    // 1 quota unit
    return googleApi("/playlistItems", {
        part: "contentDetails",
        playlistId: id
    });
}

async function sendNotification(msg) {
    return fetch(config.discordWebhook, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            content: msg
        })
    }).then(res => {
        if (!res.ok) throw new Error(`Got status ${res.status} (${res.statusText})`);
    });
}