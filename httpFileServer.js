//=======================================================================================
// Minimal web server to serve audio files to audio devices
//=======================================================================================

const config = require('./configLoader.js')({},__filename);

const randomBytes = require("crypto").randomBytes;

const port = config.httpFileServerPort || 8888;

function httpFileServer() {
    this.fileMap = {};
    this.handlerMap = {};
    
    let fileMap = this.fileMap;
    let handlerMap = this.handlerMap;
    
    // Determine the IP address of this machine
    if (!global.myIp.length) {
        console.log('There was a problem determining the IP address of this machine. Audio playback will not be available.');
        return
    }

    const http = require("http"),
        url = require("url"),
        path = require("path"),
        fs = require("fs");

    http.createServer(function(request, response) {

        let contentTypesByExtension = {
            '.html': "text/html",
            '.css':  "text/css",
            '.js':   "text/javascript",
            '.mp3':   "audio/mpeg",
            '.ogg':   "audio/ogg"
          };

        let uri = url.parse(request.url).pathname;
        // Take the slash off the front
        uri = uri.substr(1);
        
        if (handlerMap.hasOwnProperty(uri)) {
            console.log('Web server calling handler for '+uri);
            handlerMap[uri](request,response);
            return;
        }
            
        if (!fileMap.hasOwnProperty(uri)) {
            response.writeHead(404, {"Content-Type": "text/plain"});
            response.write("404 Not Found\n");
            response.end();
            console.log('Web server encountered request for unknown file: '+uri);
            return;
        }

        let filename = fileMap[uri][0];
        console.log('Serving file: '+filename);
        fs.readFile(filename, "binary", function(err, file) {
            if (err) {
              response.writeHead(500, {"Content-Type": "text/plain"});
              response.write(err + "\n");
              response.end();
              return;
            }
          
            let headers = {};
            let contentType = contentTypesByExtension[path.extname(filename)];
            if (contentType) headers["Content-Type"] = contentType;
            response.writeHead(200, headers);
            response.write(file, "binary");
            response.end();
        });
    }).listen(parseInt(port, 10));

    console.log('Static file server running at http://'+global.myIp+':' + port);
}

httpFileServer.prototype.serveFile = function( filename ) {
    let id;
    // Tidy out any files added more than 1 day ago
    let threshold = new Date().getTime() - 86400000;
    let fileMap = this.fileMap;
    
    for( id in fileMap ) {
        if (fileMap[id][1]<threshold) {
            console.log('Cleaning out audio file from web server file store: '+fileMap[id][0]);
            delete fileMap[id];
        }
    }

    id = randomBytes(20).toString('hex');
    fileMap[id] = [
        filename,
        new Date().getTime()
    ];
    // console.log('Added new file to web server file store. This now contains %d files',Object.keys(fileMap).length);
    return 'http://'+global.myIp+':'+port+'/'+id;
}

httpFileServer.prototype.addHandler = function( path, handler ) {
    this.handlerMap[path] = handler;
}

module.exports = httpFileServer;
