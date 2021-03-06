const config = require('../../../../configLoader.js')({
    musicLibraryDbFile                  : '<<baseDirectory>>/musiclibrary.db',
    audioscrobblerCacheDir              : '<<baseDirectory>>/audioscrobblerCache',
    audioscrobblerMaxCacheAge           : 100,
    playlistMaxExtraTracksPerArtist     : 10,
    playlistYearsEitherSide             : 5,
    playlistMaxTracks                   : 60,
});

const yearsEitherSide = parseInt(config.playlistYearsEitherSide);
const maxExtraTracksPerArtist = parseInt(config.playlistMaxExtraTracksPerArtist);
const maxTracks = parseInt(config.playlistMaxTracks);

const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const util = require('util');
const readline = require('readline');

const fuzz = require('fuzzball');
const fuzzLookupOptions = {
    processor: record => record.index,
    scorer: fuzz.ratio, // Any function that takes two values and returns a score, default: ratio
    limit: 1, // Max number of top results to return, default: no limit / 0.
    cutoff: 60, // Lowest score to return, default: 0
    unsorted: false // Results won't be sorted if true, default: false. If true limit will be ignored.
};

// Create the cache directory if it doesn't exist
const cacheDir = config.audioscrobblerCacheDir;
if (!fs.existsSync(cacheDir) || !fs.statSync(cacheDir).isDirectory()) {
    fs.mkdirSync(cacheDir, { recursive: true });
    if (!fs.existsSync(cacheDir) || !fs.statSync(cacheDir).isDirectory()) {
        console.error('Couldn\'t create cache directory: '+cacheDir);
        process.exit();
    }
}

// Check the required things exist
if (!fs.existsSync(config.musicLibraryDbFile) || !fs.statSync(config.musicLibraryDbFile).isFile()) {
    console.error('Couldn\'t find Beets music database: '+config.musicLibraryDbFile);
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

    if ( (new Date().getTime() - fileGetMtime(cacheFile)) < config.audioscrobblerMaxCacheAge * 86400 * 1000 ) {
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

function getSimilar(which,mbid,callback) {
    const audioscrobblerBaseUrl = 'http://ws.audioscrobbler.com/2.0/?';
    let queryString = new URLSearchParams({
        api_key:'4a4228c2a52d30641203c4e08fd0831c',
        format:'json',
        mbid:mbid,
        method:which+'.getsimilar'
    });
    const url = audioscrobblerBaseUrl + queryString;
    downloadPage(url,function(results){
        console.log(url);
        if (which=='track') {
            if (!results || !results.similartracks || !results.similartracks.track) callback(false,[]);
            else callback(false,results.similartracks.track);
        } else {
            if (!results || !results.similarartists || !results.similarartists.artist) callback(false,[]);
            else callback(false,results.similarartists.artist);
        }
    });
}
const getSimilarPromise = util.promisify(getSimilar);

function similarLookup( which, ids, extraMbid, requestedTracks, extras, fullArtists, callback ) {

    let getSimilarTracksPromises=[];
    for( let id of ids ) {
        getSimilarTracksPromises.push(getSimilarPromise(which,id));
    };
    
    Promise.all(getSimilarTracksPromises).then( function(results) {
        // flatten the results array
        results = [].concat.apply([], results);
        let mbids = {};
        for( let i=0; i<results.length; i++ ) {
            let similarItem = results[i];
            if (!similarItem.mbid || mbids[similarItem.mbid]) continue;
            mbids[similarItem.mbid]=true;
        }
        // add in the extra mbid if one has been provided
        if (extraMbid.length) mbids[extraMbid]=true;
        mbids = shuffle(Object.keys(mbids));
        let similarTrackCount=0;
        let sql = 'select id, path, artist,title from items where mb_'+which+'id';
        do {
            let chunk=mbids.splice(0,100);
            if (!chunk.length) break;
            chunk = '\''+chunk.join('\',\'',)+'\'';
            let foundSimilar = getRows( sql+' IN ('+chunk+') ORDER BY RANDOM()');
            for( let i=0; i<foundSimilar.length; i++ ){
                if (similarTrackCount>maxTracks) break;
                let track = foundSimilar[i];
                console.log('Found similar: '+track.title+' by '+track.artist);
                // exclude anything that is already in the list of requestedTracks
                if (requestedTracks[track.id]) continue;
                if (typeof(extras[track.artist])=='undefined') extras[track.artist]={};
                else if (fullArtists[track.artist]) continue;
                similarTrackCount++;
                if (which=='track') {
                    track.reason='This tracks is similar to one of the tracks that you originally requested';
                } else {
                    track.reason='This tracks is by an artist who is similar to the artist for one of the tracks that you originally requested';
                }
                extras[track.artist][track.id]=track;
                if (Object.keys(extras[track.artist]).length == maxExtraTracksPerArtist) fullArtists[track.artist]=true;
            }
        } while( true );

        callback( similarTrackCount );
    });
}

const db = require('better-sqlite3')(config.musicLibraryDbFile);
const lookups = {
    artist: getRows('select distinct mb_artistid, artist from items where genre<>\'Books & Spoken\'','artist'),
    track: getRows('select distinct mb_trackid, title from items where genre<>\'Books & Spoken\'','title'),
    album: getRows('select distinct mb_albumid, album from items where genre<>\'Books & Spoken\'','album'),
    audioBook: getRows('select distinct mb_albumid, album from items where genre=\'Books & Spoken\'','audioBook'),
};
// if the type is "something" then look for a matching track, followed by a matching album followed by a matching artist
lookups.something = lookups.track.concat(lookups.album,lookups.artist);

// console.log(lookups.artist.length+' artists');
// console.log(lookups.track.length+' tracks');

function fuzzyLookup( type, searchTerm ) {
    let result = fuzz.extract( searchTerm, lookups[type], fuzzLookupOptions);
    if (!result.length) return [false];
    result = result[0][0];

    if (type=='something') type = result.hasOwnProperty('artist')?'artist':(result.hasOwnProperty('album')?'album':'track');
    
    return [result,type];
}

function makePlaylist( type, searchTerm, callback ) {

    if (!type.length || ':catalogue:artist:album:track:anything:something:'.indexOf(type)==-1) return callback('Invalid search type ('+type+'). Expected: "catalogue", "album", "artist", "track", "anything" or "something"');
    
    var requestedTracks = {};
    let emptyMessage = '';
    let message;
    let originalArtistMbid = '';
    
    if (type=='catalogue') {
        let rows = [];
        let sql;
        
        if (searchTerm=='artists') sql = 'SELECT DISTINCT artist, album FROM items ORDER BY artist,album';
        else sql = 'SELECT DISTINCT artist, album FROM items ORDER BY album,artist';
        
        const queryHandle = db.prepare(sql);
        
        for (const row of queryHandle.iterate()) {
            rows.push(row);
        }
        
        callback('',rows,[],true);
        return;
    }
    
    let result;
    if (type=='anything') result = lookups.artist[Math.floor(Math.random()*lookups.artist.length)];
    else [result,type] = fuzzyLookup(type.toLowerCase(),searchTerm);

    if (!result) {
        if (type=='something') type='any music mathing';
        return callback('Couldn\'t find '+type+': "'+searchTerm+'"');
    } else {
        let tracks, reason;
        message = 'Playing '+type+': '+result[type];
        if (type=='artist') {
            tracks = getRows('SELECT id, title, path, album, artist, mb_artistid, mb_trackid FROM items WHERE artist=? ORDER BY RANDOM()',false,result.artist);
            emptyMessage = 'Couldn\'t find any music by: '+searchTerm;
            message = 'Playing music by "'+result.artist+'"';
            reason = 'This track is by the artist I think you requested: '+result.artist;
        } else if (type == 'track') {
            tracks = getRows('SELECT id, title, path, album, artist, mb_artistid, mb_trackid FROM items WHERE title=?',false,result.title);
            emptyMessage = 'Couldn\'t find a track called "'+searchTerm+'"';
            if (tracks.length) {
                message = 'Playing the track: "'+tracks[0].title+'"';
                reason = 'This is the track I think you requested: '+tracks[0].title;
                originalArtistMbid = tracks[0]['mb_artistid'];
            }
        } else if (type == 'album') {
            tracks = getRows('SELECT id, title, path, album, artist, mb_artistid, mb_trackid FROM items WHERE album=? ORDER BY disc,track',false,result.album);
            emptyMessage = 'Couldn\'t find the album: '+searchTerm;
            if (tracks.length) {
                message = 'Playing the album: "'+tracks[0].album+'"';
                reason = 'This is track is on the album you requested: '+tracks[0].album;
                originalArtistMbid = tracks[0]['mb_artistid'];
            }
        } else if (type == 'anything') {
            // pick an artist at random
            message = 'Playing some music';
            tracks = getRows('SELECT id, title, path, album, artist, mb_artistid, mb_trackid FROM items WHERE artist=? ORDER BY RANDOM() LIMIT 1',false,result.artist);
            if (tracks.length) {
                emptyMessage = 'Couldn\'t find any music at all';
                reason = 'This track is by the artist I selected at random, for you: '+tracks[0].artist;
                originalArtistMbid = tracks[0]['mb_artistid'];
            }
        }
        
        if (!tracks.length) return callback(emptyMessage);

        var idx=0;
        tracks.forEach(function(track){ track.idx = idx++; track.reason=reason; requestedTracks[track.id]=track; });
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
                decadeTracks = getRows('SELECT items.id,items.path,items.artist, items.album, items.title, item_attributes.value AS year FROM item_attributes INNER JOIN items ON items.id=item_attributes.entity_id WHERE item_attributes.key=\'recording_year\' AND (item_attributes.value >=? AND item_attributes.value <=?) AND genre<>\'Books & Spoken\' ORDER BY ABS(item_attributes.value-?),RANDOM()',false,averageYear-yearsEitherSide,averageYear+yearsEitherSide,averageYear);
                for( let track of decadeTracks ) {
                    track.reason='This track was recorded in '+track.year+' which is within 5 years of '+averageYear;
                }
            }
        }
    }

    var extras = {};
    var fullArtists = {};

    let lookupTrackIds = [];
    let lookupArtistIds = {};
    for( let track of Object.entries( requestedTracks )) {
        track = track[1];
        if (!track.mb_trackid.length) continue;
        lookupTrackIds.push(track.mb_trackid);
        if (!track.mb_artistid.length) continue;
        lookupArtistIds[track.mb_artistid]=true;
    };
    lookupArtistIds = Object.keys(lookupArtistIds);
    
    similarLookup( 'track', lookupTrackIds, '', requestedTracks, extras, fullArtists, function(similarTrackCount){
        
        console.log('Found '+similarTrackCount+' similar tracks');
        // look for similar artists
        similarLookup( 'artist', lookupArtistIds, originalArtistMbid, requestedTracks, extras, fullArtists, function(similarArtistCount){
            console.log('Found '+similarArtistCount+' tracks by similar artists');
            let numTracks = Object.keys(requestedTracks).length + similarTrackCount + similarArtistCount;

            // Now throw in everything x years either side of the averageYear
            for( let i=0; i<decadeTracks.length; i++ ) {
                if (numTracks>=maxTracks) break;
                let track = decadeTracks[i];
                if (typeof(extras[track.artist])=='undefined') extras[track.artist]={};
                if (fullArtists[track.artist] || requestedTracks[track.id]) continue;
                numTracks++;
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
            requestedTracks = Object.values(requestedTracks).sort((a,b)=>a.idx-b.idx);
            
            callback( message, requestedTracks, extraTracks );
        });
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
        makePlaylist( type, searchTerm, function(message,requestedTracks,extraTracks,ignoreLimit){
            process.stdout.write(message+"\n");
            let output = [];
            let count = 0;
            if (requestedTracks) {
                for( id in requestedTracks) {
                    if (!ignoreLimit && count++>maxTracks) break;
                    if (requestedTracks[id].hasOwnProperty('path')) requestedTracks[id].path = requestedTracks[id].path.toString();
                    output.push(requestedTracks[id]);
                }
            }
            if (extraTracks) {
                for( id in extraTracks) {
                    if (!ignoreLimit && count++>maxTracks) break;
                    if (extraTracks[id].hasOwnProperty('path')) extraTracks[id].path = extraTracks[id].path.toString();
                    output.push(extraTracks[id])
                }
            }
            process.stdout.write(JSON.stringify(output)+'\n');
            process.stdout.write('END\n');
            
            busy = false;
            processQueue();
        });
    }

};

process.on('exit',function(){
    db.close();
});
