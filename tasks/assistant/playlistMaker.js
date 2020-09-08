const config = require('../../configLoader.js')({
    dbFile                  : '<<baseDirectory>>/musiclibrary.db',
    cacheDir                : '<<baseDirectory>>/audioscrobblerCache',
    maxCacheAge             : 100,
    maxExtraTracksPerArtist : 10,
    yearsEitherSide         : 5,
});

const yearsEitherSide = parseInt(config.yearsEitherSide);
const maxExtraTracksPerArtist = parseInt(config.maxExtraTracksPerArtist);

const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const util = require('util');
const readline = require('readline');

const fuzz = require('fuzzball');
const fuzzLookupOptions = {
    processor: record => record.index,
    scorer: fuzz.partial_ratio, // Any function that takes two values and returns a score, default: ratio
    limit: 1, // Max number of top results to return, default: no limit / 0.
    cutoff: 60, // Lowest score to return, default: 0
    unsorted: false // Results won't be sorted if true, default: false. If true limit will be ignored.
};

// Create the cache directory if it doesn't exist
const cacheDir = config.cacheDir;
if (!fs.existsSync(cacheDir) || !fs.statSync(cacheDir).isDirectory()) {
    fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(cacheDir) || !fs.statSync(cacheDir).isDirectory()) {
        console.error('Couldn\'t create cache directory: '+cacheDir);
        process.exit();
    }
}

// Check the required things exist
if (!fs.existsSync(config.dbFile) || !fs.statSync(config.dbFile).isFile()) {
    console.error('Couldn\'t find Beets music database: '+config.dbFile);
    process.exit();
}
    
function shuffle(arr) {

  let collection = arr,
      len = arr.length,
      random,
      temp;

  while (len) {
    random = Math.floor(Math.random() * len);
    len -= 1;
    temp = collection[len];
    collection[len] = collection[random];
    collection[random] = temp;
  }

  return collection;
};

function fileGetMtime(filename) {
    let mtimeMs;
    try {
        mtimeMs = fs.statSync(filename).mtimeMs
    } catch (e) {
        // If file not found just return false without an error
        if (e.code=='ENOENT') return 0;
        // Otherwise print the error on the console
        console.error('Couldn\'t read contents of file"'+filename+'". Got '+e.toString());
        return false;
    }
    return mtimeMs
}

function fileGetContents(filename,encoding) {
    let contents;
    if (!encoding) encoding='binary';
    try {
        contents = fs.readFileSync(filename);
    } catch (e) {
        // If file not found just return false without an error
        if (e.code=='ENOENT') return false;
        // Otherwise print the error on the console
        console.error('Couldn\'t read contents of file"'+filename+'". Got '+e.toString());
        return false;
    }
    return contents.toString();
}

function filePutContents(filename,contents,encoding) {
    if (!encoding) encoding='binary';
    try {
        contents = fs.writeFileSync(filename,contents,{encoding:encoding});
    } catch (e) {
        console.error('Couldn\'t read contents of file"'+filename+'". Got '+e.toString());
        return false;
    }
    return true;
}

function md5( input ) {
    return crypto.createHash('md5').update(input).digest('hex');
}

function getRows( query, indexField, ...queryParameters ) {
    const queryHandle = db.prepare(query);
    const rows = [];
    
    for (const row of queryHandle.iterate(...queryParameters)) {
        if (indexField) row.index = fuzz.full_process( row[indexField], {force_ascii: true} );
        rows.push(row);
    };
    return rows;    
}

function downloadPage(url,callback) {
    
    const cacheFile = cacheDir + '/' + md5(url);

    if ( (new Date().getTime() - fileGetMtime(cacheFile)) < config.maxCacheAge * 86400 * 1000 ) {
        // Use the chached version
        let contents = fileGetContents(cacheFile);
        let notUsed;
        [notUsed, contents] = contents.split("\n",2);
        try {
            contents = JSON.parse(contents);
        } catch(e) {
            contents = false;
        }
        if (contents !== false) {
            callback(contents);
            return;
        }
    }
    
    var buffer = Buffer.alloc(0);
    const request = http.get(url, function(response) {
        //console.log(`statusCode: ${response.statusCode}`)

        response.on('data', data => {
            buffer = Buffer.concat([buffer, data]);
        })
    });

    request.on('close', error => {
        let contents;
        try {
            contents = JSON.parse(buffer);
        } catch(e) {
            contents = false;
        }
        if (contents!==false) filePutContents(cacheFile,url+"\n"+buffer.toString('binary'));
        callback(contents);
    });

    request.on('error', error => {
        callback(false);
    });

    request.end();
    
}

function getSimilar(mbid,callback) {
    const audioscrobblerBaseUrl = 'http://ws.audioscrobbler.com/2.0/?';
    let queryString = new URLSearchParams({
        api_key:'4a4228c2a52d30641203c4e08fd0831c',
        format:'json',
        mbid:mbid,
        method:'track.getsimilar'
    });
    const url = audioscrobblerBaseUrl + queryString;
    downloadPage(url,function(tracks){
        if (!tracks || !tracks.similartracks || !tracks.similartracks.track) callback('No tracks returned',[]);
        callback(false,tracks.similartracks.track);
    });
}
const getSimilarPromise = util.promisify(getSimilar);

const db = require('better-sqlite3')(config.dbFile);
const lookups = {
    artist: getRows('select distinct mb_artistid, artist from items where genre<>\'Books & Spoken\'','artist'),
    track: getRows('select distinct mb_trackid, title from items where genre<>\'Books & Spoken\'','title'),
    album: getRows('select distinct mb_albumid, album from items where genre<>\'Books & Spoken\'','album'),
};

// console.log(lookups.artist.length+' artists');
// console.log(lookups.track.length+' tracks');

function fuzzyLookup( type, searchTerm ) {
    results = fuzz.extract( searchTerm, lookups[type], fuzzLookupOptions);
    if (!results.length) return false;
    return results[0][0];
}

function makePlaylist( type, searchTerm, callback ) {

    if (!type.length || ':artist:album:track:random:'.indexOf(type)==-1) return callback('Invalid search type ('+type+'). Expected: "album", "artist", "track" or "random"');
    
    var requestedTracks = {};
    let emptyMessage = '';
    let message;
    
    let result;
    if (type=='random') result = lookups.artist[Math.floor(Math.random()*(lookups.artist.length-0.001))];
    else result = fuzzyLookup(type.toLowerCase(),searchTerm);
    
    if (!result) {
        return callback('Couldn\'t find '+type+': '+searchTerm);
    } else {
        let tracks;
        message = 'Playing '+type+': '+result[type];
        if (type=='artist') {
            tracks = getRows('SELECT id, path, mb_artistid, mb_trackid FROM items WHERE artist=? ORDER BY RANDOM()',false,result.artist);
            emptyMessage = 'Couldn\'t find any music by: '+searchTerm;
        } else if (type == 'track') {
            tracks = getRows('SELECT id, path, mb_artistid, mb_trackid FROM items WHERE title=?',false,result.title);
            emptyMessage = 'Couldn\'t find a track called "'+searchTerm+'"';
        } else if (type == 'album') {
            tracks = getRows('SELECT id, path, mb_artistid, mb_trackid FROM items WHERE album=? ORDER BY disc,track',false,result.album);
            emptyMessage = 'Couldn\'t find the album: '+searchTerm;
        } else if (type == 'random') {
            // pick an artist at random
            message = 'Playing some music';
            tracks = getRows('SELECT id, path, mb_artistid, mb_trackid FROM items WHERE artist=? ORDER BY RANDOM() LIMIT 1',false,result.artist);
            emptyMessage = 'Couldn\'t find any music at all';
        }
        
        if (!tracks.length) return callback(emptyMessage);

        var idx=0;
        tracks.forEach(function(track){ track.idx = idx++; requestedTracks[track.id]=track; });
    }

    if (!Object.keys(requestedTracks).length) callback(message,[],[]);
    
    // get tracks x years either side
    var decadeTracks = [];
    // This feature can be disabled by setting yearsEitherSide to -1 (or any negative number)
    if (yearsEitherSide>=0) {
        // get the average recording year 
        let trackIds = '\''+Object.keys(requestedTracks).join('\',\'',)+'\'';
        result = getRows('SELECT AVG(value) AS average FROM item_attributes WHERE key=\'recording_year\' AND entity_id IN ('+trackIds+') AND value>1800');
        if (result.length) {
            var averageYear = Math.round(result[0].average);
            if (averageYear>0) {
                console.log('recording year is:'+averageYear);
                decadeTracks = getRows('SELECT items.id,items.path,items.artist FROM item_attributes INNER JOIN items ON items.id=item_attributes.entity_id WHERE item_attributes.key=\'recording_year\' AND (item_attributes.value >=? AND item_attributes.value <=?) AND genre<>\'Books & Spoken\' ORDER BY ABS(item_attributes.value-?),RANDOM()',false,averageYear-yearsEitherSide,averageYear+yearsEitherSide,averageYear);
            }
        }
    }
    
    let getSimilarPromises=[];
    for( trackId in requestedTracks ) {
        track = requestedTracks[trackId];
        if (!track.mb_trackid) continue;
        getSimilarPromises.push(getSimilarPromise(track.mb_trackid));
    };

    var extras = {};
    var fullArtists = {};
    
    Promise.all(getSimilarPromises).then( function(results) {
        // flatten the results array
        results = [].concat.apply([], results);
        let mbids = {};
        for( let i=0; i<results.length; i++ ) {
            let similarTrack = results[i];
            if (!similarTrack.mbid || mbids[similarTrack.mbid]) continue;
            mbids[similarTrack.mbid]=true;
        }
        mbids = Object.keys(mbids);
        do {
            let chunk=mbids.splice(0,100);
            if (!chunk.length) break;
            chunk = '\''+chunk.join('\',\'',)+'\'';
            let foundSimilar = getRows('select id, path, artist,title from items where mb_trackid IN ('+chunk+')');
            for( let i=0; i<foundSimilar.length; i++ ){
                let track = foundSimilar[i];
                console.log('Found similar: '+track.title+' by '+track.artist);
                // exclude anything that is already in the list of requestedTracks
                if (requestedTracks[track.id]) continue;
                if (typeof(extras[track.artist])=='undefined') extras[track.artist]={};
                else if (fullArtists[track.artist]) continue;
                extras[track.artist][track.id]=track;
                if (Object.keys(extras[track.artist]).length == maxExtraTracksPerArtist) fullArtists[track.artist]=true;
            }
        } while( true );
        
        // Now throw in everything x years either side of the averageYear
        for( let i=0; i<decadeTracks.length; i++ ) {
            let track = decadeTracks[i];
            if (typeof(extras[track.artist])=='undefined') extras[track.artist]={};
            if (fullArtists[track.artist] || requestedTracks[track.id]) continue;
            extras[track.artist][track.id]=track;
            if (Object.keys(extras[track.artist]).length == maxExtraTracksPerArtist) fullArtists[track.artist]=true;
        }

        let extraTracks = [];
        for( let artist in extras ) {
            for( let id in extras[artist] ) {
                extraTracks.push(extras[artist][id]);
            }
        }

        shuffle(extraTracks);
        // Convert the requestedTracks into an array in the order they were originally pulled out of the database in
        requestedTracks = Object.values(requestedTracks).sort((a,b)=>b.idx-a.idx);
        
        callback( message, requestedTracks, extraTracks );
    });
}


const commandQueue = [];
var busy = false;

const reader = readline.createInterface({
  input: process.stdin,
  output: null,
  terminal: false,
});

reader.on('line', function(line){
    commandQueue.push( line.trim().split(/\s*:\s*/,2) );
    processQueue();
});

function processQueue() {
  
    let lockId = Math.round(Math.random()*100000);
    if (!busy) busy=lockId;

    // Did we get the lock?
    if (busy==lockId) {
        if (!commandQueue.length) {
            busy=false;
            return;
        }
        let [type,searchTerm] = commandQueue.shift();
        if (type=='END') process.exit();
        makePlaylist( type, searchTerm, function(message,requestedTracks,extraTracks){
            process.stdout.write(message+"\n");
            if (requestedTracks) {
                for( id in requestedTracks) {
                    process.stdout.write( id+':'+requestedTracks[id].path+'\n' );
                }
            }
            if (extraTracks) {
                for( id in extraTracks) {
                    process.stdout.write( extraTracks[id].id+':'+extraTracks[id].path+'\n' );
                }
            }
            process.stdout.write('END\n');
            
            busy = false;
            processQueue();
        });
    }

};

process.on('exit',function(){
    db.close();
});