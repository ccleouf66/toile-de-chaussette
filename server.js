const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const url = require('url');
const { count } = require('console');

activeTrack = {}

const ws = http.createServer();
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', function connection(ws, request, client) {
    ws.on('error', console.error);

    ws.on('message', function message(data) {
        console.log(`Received message ${data} from user ${client}`);
    });

    ws.on('close', function close() {
        console.log('client disconnected');
        removeClientToTrack(ws);
        console.log(activeTrack)
    });
});

ws.on('upgrade', function upgrade(request, socket, head) {
    socket.on('error', console.error);
    const { pathname } = url.parse(request.url);

    if (pathname != null) {
        wss.handleUpgrade(request, socket, head, function done(ws) {
            // get ws port for coresponding track
            getTackConfig(pathname).then((port) => {
                appendClientToTrack(ws, port);
                wss.emit('connection', ws, request);
                console.log(activeTrack)
            }).catch((err) => {
                console.log(err);
                socket.destroy();
            }); 
        });
    } else {
        socket.destroy();
    }
});

ws.listen(8080, "0.0.0.0", () => {
    console.log("listening on port 8080");
})

async function getTackConfig(trackName) {
    // http://www.apex-timing.com/live-timing/$QUERY_STRING/javascript/config.js
    baseUrl = "http://www.apex-timing.com/live-timing/"+trackName+"/javascript/config.js"

    return new Promise((resolve, reject) => {
        http.get(baseUrl, res => {
            let data = [];
            if (res.statusCode != 200) {
                reject(res.statusCode+" - track not found");
            }

            res.on('data', chunk => {
                data.push(chunk);
            });

            res.on('end', () => {
                body = Buffer.concat(data).toString();
                const match = body.match(/var\s+configPort\s*=\s*([^;]+)/);
                if (match) {
                    trackPort = parseInt(match[1])+2;
                    resolve(trackPort);
                }
            });
        }).on('error', err => {
            reject(err);
        });
    });

}

function appendClientToTrack(wsClient, trackPort) {
    trackId = "track-"+trackPort;
    
    if (activeTrack[trackId] == null) {
        console.log("track not found");
        openNewApexWs(trackId, trackPort, wsClient);
    } else {
        activeTrack[trackId].wsClients.push(wsClient);
    }
}

function removeClientToTrack(wsClient) {
    Object.keys(activeTrack).forEach((tackId) => {
        activeTrack[tackId].wsClients.forEach((trackWsClient, i) => {
            if(trackWsClient == wsClient) {
                activeTrack[tackId].wsClients.splice(i, 1);
                if(activeTrack[tackId].wsClients.length === 0) {
                    //Disconnecte apex ws and remove trak from list
                    activeTrack[tackId].ws.close()
                    delete activeTrack[tackId]
                }
            }
        })
    })
}

function openNewApexWs(trackId, trackPort, wsClient) {
    // open new apex ws client
    wsApex = new WebSocket('ws://www.apex-timing.com:'+trackPort);

    wsApex.on('error', console.error);

    wsApex.on('open', function open() {
        console.log("ws connected")
        activeTrack[trackId] = {
            ws: wsApex,
            wsClients: [wsClient]
        }
    });

    wsApex.on('message', function message(data, isBinary) {
        broadcastMsg(data, isBinary , trackId)
    });
}

function disconnectApexWS(ws) {

}

function broadcastMsg(message, isBinary, trackId) {
    activeTrack[trackId].wsClients.forEach(wsClient => {
        wsClient.send(message, { binary: isBinary })
    });
}
