const config = require('../../../../configLoader.js')({},__filename);

const { spawn } = require('child_process');

console.log('Starting playlist maker');

var playlistMaker = spawn('node',[__dirname+'/playlistMaker.js']);

var buffer = '';
var onOutput = false;

let stationNames = Object.keys(config.radioStations).sort( (k1,k2) => k1.length - k2.length );

// resolve alias in the radio station list
for (let station in config.radioStations) {
    while (config.radioStations.hasOwnProperty(config.radioStations[station])) {
        config.radioStations[station] = config.radioStations[ config.radioStations[station] ];
    }
}
let matchFunctions = {
    'radioStation' : function(str) {
        for ( let station of stationNames ) {
            if (str.indexOf(station)===0) {
                return [str.substr(station.length)]
            } 
        }
        return [];
    }
};

playlistMaker.stdout.on('data',function(data){
    buffer += data.toString();
    let endPos = buffer.indexOf("\nEND\n");
    if (endPos>=0) {
        if (onOutput) onOutput(buffer.substr( 0, endPos ));
        buffer = buffer.substr( endPos+5 );
    }
    
})

playlistMaker.stderr.on('data',function(data){
    console.log('playlistMaker.js generated error: '+data.toString());
});

function cantFindPlayerMessage(assistant,player) {
    players = Object.keys(assistant.manager.audioPlayers).sort();
    response = 'I can\'t see any speaker called "'+player+'". ';
    if (players.length>1) response += 'The speakers I can see are called: '+assistant.englishJoin(players,';');
    else response += 'The only speaker I can see is called: "'+players[0]+'"';
    return( response );
}

function describeTrack( track ) {
    let response = '"'+track.title+'"';
    if (track.hasOwnProperty('artist') && track.artist.length) response+=' by '+track.artist;
    if (track.hasOwnProperty('album') && track.album.length) response+=' from the album "'+track.album+'"';
    return response;
}

function playMusic( matchDetails, assistant, callback ) {

    console.log(matchDetails);
    let player = assistant.manager.findAudioPlayer(matchDetails.player);
    if (!player) {
        return cantFindPlayerMessage( assistant, matchDetails.player );
    }
    
    if (matchDetails.radio) {
        let response = 'Playing '+matchDetails.radio;
        
        let tracks = [config.radioStations[matchDetails.radio]];
        tracks[0].album = '';
        
        if (player != 'local') response += ' on '+player;
        
        callback({
            do : function(){
                assistant.manager.audioPlayer(player,'enqueue',tracks);
                setTimeout(function(){assistant.manager.audioPlayer(player,'play')},1500);
            },
            say : [response,response.replace(/^playing/i,'play')]
        });
        
    } else {
        let types = ['anything','something','track','album','artist'];
        let type;
        for (let match in matchDetails) {
            if (types.includes(match)) {
                type=match;
                break
            }
        }
    
        let name = matchDetails[type];
        
        playlistMaker.stdin.write(type+':'+name+'\n');
        console.log('Playing '+type+':'+name+' on '+player);

        onOutput = function(data){
            let lines = data.split('\n');
            let response = '';
            let tracks;
            for (let i=0; i<lines.length; i++) {
                if (!lines[i].length) continue;
                if (lines[i].match(/^\[/)) {
                    tracks = JSON.parse( lines.slice(i).join('\n') );
                    break;
                }
                response = lines[i];
            }
            
            if (!Array.isArray(tracks)) {
                callback(response);
            } else {
                if (player != 'local') response += ' on '+player;
                callback({
                    do : function(){
                        assistant.manager.audioPlayer(player,'enqueue',tracks);
                        // When playing from a playlist of URL's we need to wait till mplayer has actually
                        // cued the song up before telling it to play
                        setTimeout(function(){assistant.manager.audioPlayer(player,'play')},2500);
                    },
                    say : [response,response.replace(/^playing/i,'play')]
                });
            }
        }
    }
}

let phrasebook = {
    'onDevice' : '[in|on] [the] (player:<stuff>) [|speaker|chromecast]'
};

let capabilities = [
    {
        incantations    : [
            '$delayStart play [me] (radio:<radioStation>) [$onDevice] $delayStart',
        ],
        handler         : playMusic
    },{
        incantations    : [
            '$delayStart play [me] (anything:[[|some|any] music|anything]) [$onDevice] $delayStart',
            '$delayStart play [me] [[[a] track[s]|[some] music|something] [by|from] [the [artist|band|musician|composer]]|some] (artist:<stuff>) [$onDevice] $delayStart',
            '$delayStart play [me] the album (album:<stuff>)] [$onDevice] $delayStart',
            '$delayStart play [me] [the] [track|song] (track:<stuff>) [$onDevice] $delayStart',
            '$delayStart play [me] (something:<stuff>) [$onDevice] $delayStart',
        ],
        handler         : playMusic
    },{
        incantations    : [
            '[tell me] what [speakers|[music] players|chromecast[s]|[|chromecast|[music] [player|playback]] device[s]] [do I have|are [there] [available]|can I [stream|send|play] [music] [to[o]|on]] [on the network]',
        ],
        handler         : function(matchDetails, assistant, callback ) {
            players = Object.keys(assistant.manager.audioPlayers).sort();
            response = 'You can stream music to the following devices: '+assistant.englishJoin(players,';');
            return( response );
        }
    },{
        incantations    : [
            '[play [me] the] (direction:[next|previous]) [|track|song] [$onDevice]',
            '[go] (direction:back) [|a song|to the [last|previos] song]',
        ],
        handler         : function(matchDetails, assistant, callback ) {
            // if they specified a device then that's easy...
            let player;
            if (matchDetails.player) {
                player = assistant.manager.findAudioPlayer(matchDetails.player);
                
                if (player===false) return cantFindPlayerMessage( assistant, matchDetails.player );
            } else {
                let players = assistant.manager.activePlayers();

                if (!players.length) {
                    response = 'I can\'t find any speakers that are currently playing any music';
                    return( response );
                } else if (players.length>1) {
                    response = 'There are multiple speakers playing music at the moment.';
                    response += 'You can say: "play the next track on '+players[0]+' to tell me which one you\'re referring to.';
                    response += 'The speakers that are currently playing are: '+assistant.englishJoin(players,';');
                    return( response );
                } else {
                    player = players[0]
                }
                    
            }

            assistant.manager.audioPlayer(players[0],matchDetails.direction);
            return;
        }
    },{
        incantations    : [
            '$delayStart turn [the] (what:[music [volume]|it|volume]) [of [the] (player:<stuff>)] (direction:[up|down]) [$onDevice] $delayStart',
            '$delayStart turn (direction:[up|down]) [the] (what:[music|volume]) [$onDevice] $delayStart',
            '$delayStart [make] [the] (what:[music|it|volume]) [of [the] (player:<stuff>)] (direction:[[up:louder|xxxx]|[down:quieter|xxxx]]) [on [the] (player:<stuff>)] $delayStart',
            '$delayStart [set|turn|make] [the] (what:[music [volume]|volume]) [$onDevice] to [(number:[$singleDigitInteger|10])|(percent:$percentage)] [$onDevice] $delayStart'
        ],
        handler         : function(matchDetails, assistant, callback ) {
            let players = [];
            
            // if they specified a device then that's easy...
            if (matchDetails.player) {
                let player = assistant.manager.findAudioPlayer(matchDetails.player);
                
                if (player===false) return cantFindPlayerMessage( assistant, matchDetails.player );
                
                players = [player];
            } else {
                players = assistant.manager.activePlayers();
                
                // if they specifically requested "the music" then find out where music is playing
                if (matchDetails.what=='music') {
                    
                    if (!players.length) {
                        response = 'I can\'t find any speakers that are currently playing any music';
                        return( response );
                    }
                }
                
                // if they just said "turn it up" without specifying what then...
                else {
                    // if there is music playing on just one speaker then assume they mean that
                    if (players.length==1) {
                        // nothing to do since players is already pointing to the thing we want to adjust the volume on
                    } else {
                        // otherwise assume that they mean "local"
                        players = [ 'local' ]
                    }
                }
            }
            return {
                do : function() {
                    for( let player of players) {
                        if (!assistant.manager.audioPlayers.hasOwnProperty(player)) continue;
                        player = assistant.manager.audioPlayers[player];
                        if ( matchDetails.percent ) player.setVolume( parseInt(matchDetails.percent) );
                        else if ( matchDetails.number) player.setVolume( parseInt(matchDetails.number)*10 );
                        else player[ matchDetails.direction=='up' ? 'increaseVolume' : 'decreaseVolume' ]();
                    }
                }
            }
        }
    },{
        incantations    : [
            '$delayStart (action:[[play:play|resume]|[pause:pause|stop [playing]]]) [the music] $delayStart',
            '$delayStart (action:[[play:play|resume]|[pause:pause|stop [playing]]]) [the] [music] $onDevice $delayStart',
            '(action:[pause:[be] quiet|!])',
            '(action:[pause:shut up|!])'
        ],
        handler         : function(matchDetails, assistant, callback ) {
            let action = matchDetails.action;
            console.log(action+'ing the music');
            players = assistant.manager.activePlayers( action==='play'?'paused':'playing' );
            
            // if they specified a device then that's easy...
            if (matchDetails.player) {
                let player = assistant.manager.findAudioPlayer(matchDetails.player);
                
                if (player===false) {
                    return cantFindPlayerMessage( assistant, matchDetails.player );
                }
                
                if (players.indexOf(player)<0) {
                    if (action==='pause') return 'There is no music playing on '+matchDetails.player+' at the moment';
                    // If they asked us to play when it was already playing then just ignore them
                    else return {};
                }
                players = [player];
            } else {
                if (!players.length) {
                    if (action==='pause') return 'There is no music playing at the moment';
                    else return 'There is no paused music to resume';
                }

                // if there is music playing on just one speaker then assume they mean that
                if (players.length==1) {
                    // nothing to do since players is already pointing to the thing we want to stop
                // otherwise if local is playing then assume they mean that
                } else if (players.indexOf('local')>=0) {
                    players = ['local'];
                } else {
                    // otherwise assume that they mean everything
                    // nothing to do here as 'players' already contains all active players
                }
            }
            
            return {
                do : function() {
                    for( let player of players) {
                        console.log('>>>'+action+'ing '+player);
                        assistant.manager.audioPlayer(player,action);
                    }
                }
            }           
        }
    },{
        incantations    : [
            '[whats|what is] playing [now] [$onDevice [now]]',
            'whats this [playing [now]] [$onDevice [now]]',
        ],
        handler         : function(matchDetails, assistant, callback ) {
            let respond = function( nowPlaying ) {
                if (nowPlaying===false) return callback('Nothing is playing at the moment')
                let response;
                if (Object.keys(nowPlaying).length==1) {
                    response = 'Currently playing: '+describeTrack( nowPlaying[Object.keys(nowPlaying)[0]] );
                } else {
                    response = [];
                    for( let player in nowPlaying ) {
                        response.push( player + ' is playing ' + describeTrack( nowPlaying[player] ) );
                    }
                    response = assistant.englishJoin(response);
                }
                callback(response);
            }
            // If they queried a specific player then just return that one
            if (matchDetails.player) {
                let player = assistant.manager.findAudioPlayer(matchDetails.player);
                if (player===false) return cantFindPlayerMessage( assistant, matchDetails.player );
                player = assistant.manager.audioPlayers[player];
                if (player.getStatus()!='playing') return 'Nothing is playing on "'+matchDetails.player+'" at the moment';
                player.nowPlaying(function(nowPlaying){ r={}; r[player.name]=nowPlaying; respond(r); } );
            } else {
                // Otherwise tell them what is playing everywhere
                assistant.manager.nowPlaying( respond );
            }
        }
    }
];

module.exports = {
    phrasebook: phrasebook,
    matchFunctions: matchFunctions,
    capabilities: capabilities
}
