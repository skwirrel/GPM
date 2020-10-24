//=======================================================================================
// Chromecast Audio Player
//=======================================================================================

const Client                = require('castv2-client').Client;
const DefaultMediaReceiver  = require('castv2-client').DefaultMediaReceiver;
const mdns                  = require('mdns-js');

var manager;

function audioPlayer( attributes ) {
    this.host = attributes.host;
    this.name = attributes.fn;
    this.queuedActions = [];
    this.client = false;
    this.interupted = 0;
    this.status = 'stopped';
    this.playlist = [];
}

audioPlayer.prototype.startPlayer = function() {
}

audioPlayer.prototype.setVolume = function( percent ) {
    this.volume=percent;
    if (!this.client) return false;
    console.log('>> '+percent/100);
    this.client.setVolume({level:percent/100}, function(err, newvol){
        if(err) {
            console.log("there was an error setting the volume:".err)
        } else {
            console.log("volume changed to %s", Math.round(newvol.level * 100))
        }
    });
}

audioPlayer.prototype.increaseVolume = function( percent=10 ) {
    if (this.volume==100) return;
    
    this.setVolume( Math.min(100,this.volume+percent) );
}

audioPlayer.prototype.decreaseVolume = function( percent=10 ) {
    if (this.volume==0) return;
    
    this.setVolume( Math.max(0,this.volume-percent) );
}

audioPlayer.prototype.nowPlaying = function( callback ) {
    return callback( self.playlist[i] );
}

audioPlayer.prototype.interupt = function() {
    if (this.status=='playing' && !this.interupted ) this.pause();
    this.interupted++;
}

audioPlayer.prototype.resume = function() {
    this.interupted--;
    if (!this.interupted) {
        if (this.status=='playing') this.play();
    }
}

audioPlayer.prototype.launch = function() {
    // set this.player to "connecting" to indicate that we are in the process of connecting
    this.player = 'connecting';

    this.client = new Client();
    let self = this;
    this.client.connect(this.host, function() {
        console.log('Chromecast connected on %s',self.name);
     
        self.client.launch(DefaultMediaReceiver, function(err, player) {
            if (err) {
                console.log('Chromecast Media Player error: ',err);
                return;
            }
            self.setVolume(50);
            
            console.log('Chromecast Media Player running on %s',self.name);

            self.player = player;
            // see if we have queued actions
            if (self.queuedActions.length) {
                self.playerAction('fromQueue');
            }
            
            player.on('status', function(status) {
                 console.log('Chromecast status update: playerState=%s', status.playerState);
                 if (status.playerState=='PAUSED') self.status = 'paused';
                 else if (status.playerState=='IDLE') self.status = 'stopped';
                 else if (status.playerState=='PLAYING') self.status = 'playing';
            });
        });
    });
}

audioPlayer.prototype.playerAction = function( callback ) {
    let fromQueue = false;
    if ( callback==='fromQueue' ) {
        fromQueue = true;
        if (!this.queuedActions.length) return;
        callback = this.queuedActions.shift();
    }
    if (!this.player || this.player==='connecting') {
        // If the thing we wanted to do has just come off the front of the queue, then put it back on the front of the queue
        if (fromQueue) this.queuedActions.unshift(callback);
        // otherwise add it to the end of the queue
        else this.queuedActions.push(callback);
        if (!this.player) this.launch();
    }
    // If there is a queue then make this action wait its turn
    else if (!fromQueue && this.queuedActions.length) this.queuedActions.push(callback);
    else {
        callback(this.player);
        if (fromQueue && this.queuedActions.length) {
            let self = this;
            setTimeout( function() { self.playerAction( 'fromQueue' ) },1000);
        }
    }
}

// This tells the manager/tasks the status of the player. It returns "playing" "paused" or "stopped"
// This ignores the interuption status, so if the music has been interrupted (so is not actually playing) it will still return "playing"
audioPlayer.prototype.getStatus = function() {
    return this.status;
}

audioPlayer.prototype.play = function() {
    if (this.status=='playing') return false;
    this.status='playing';
    if (this.interupted) return false;
    let self = this;
    this.playerAction(function(player){
        console.log('Starting Chromecast playback on '+self.name);
        console.log(player);
        player.play();
    });
    return true;
}

audioPlayer.prototype.pause = function() {
    if (this.status!='playing') return false;
    this.status='paused';
    if (this.interupted) return false;
    this.playerAction(function(player){
        player.pause();
    });
    return true;
}

audioPlayer.prototype.next = function() {
    // Because there is no command I can see to tell the chromecast to go forward one track
    // we have this rather convoluted proces...
    //   Get the current status
    //   Find this in the track list
    //   requeue all the songs starting with the next one in the track list
}

audioPlayer.prototype.previous = function() {
    // Because there is no command I can see to tell the chromecast to go back one track
    // we have this rather convoluted proces...
    //   Get the current status
    //   Find the previous one in the track list
    //   requeue all the songs starting with the previous one in the track list
}

audioPlayer.prototype.makeTemporaryPlaylist = function( tracks ) {
    let trackList = tracks.map( track => track.path ).join("\n");
    
    if (!trackList.length) return false;
    
    // Create the temporary file
    const tempPath = path.join(os.tmpdir(), 'playlist-');
    const tempDir = fs.mkdtempSync(tempPath)
    const tempFile = tempDir+'/playlist.m3u8';
    console.log('Create temporary playlist: '+tempFile);
    console.log(trackList);
    fs.writeFileSync(tempFile, trackList);
    
    setTimeout(function() {
        console.log('Deleted temporary playlist: '+tempFile);
        //fs.unlinkSync(tempFile);
        //fs.rmdirSync(tempDir);
    },1000);
    return tempFile;
}

audioPlayer.prototype.nowPlaying = function( callback ) {
    let self = this;
    this.playerAction(function(player){
        player.getStatus(function(err,status) {
            if (err) {
                console.log( 'Chromecast error encountered when getting player status: ',err );
                return false;
            }
            playing = '';
            if (typeof(status.media=='object') && status.media.hasOwnProperty('contentId')) {
                playing = status.media.contentId;
            }
            for( let i=0; i<self.playlist.length; i++ ) {
                if (playing===self.playlist[i].url) return callback( self.playlist[i], i );
            }
            console.log("Couldn't find current playing file in the playlist");
            callback( false );
        });
    });
}

audioPlayer.prototype.enqueue = function( tracks, append=false ) {
    if (append) this.playlist.push(...tracks);
    else this.playlist=tracks;

    let mediaList = [];
    let autoplay=false;
    for( let track of tracks ) {
        // See https://developers.google.com/cast/docs/reference/chrome/chrome.cast.media.QueueItem
        // and https://developers.google.com/cast/docs/reference/messages#MediaInformation
        mediaList.push({
            autoplay        : autoplay,
            preloadTime     : 1,
            activeTrackIds  : [],
            media: {
                contentId: track.url,
                contentType: 'audio/mpeg',
                streamType: 'BUFFERED', // or LIVE

                metadata: {
                    type: 3,
                    albumName: track.album,
                    artist: track.artist,
                    title: track.title,
                    metadataType: 3,
                }
            }
        });
        
        // I think we want to set autoplay to false for just the first track
        // not at all sure about this though!
        autoplay=true;
    }
    
    this.playerAction(function(player){
        player.queueLoad(mediaList, { }, function(err, status) {
            if (err) console.log( 'Chromecast error encountered when loading playlist: ',err );
        });
    });
}

audioPlayer.prototype.shutdown = function( ) {
}

var registerPlayerCallback;

if (global.myIp.length) {
    var browser = mdns.createBrowser(mdns.tcp('googlecast'));

    browser.on('ready', function onReady() {
      console.log('MDNS browser is ready (looking for Chromecast devices)');
      browser.discover();
    });

    browser.on('update', function onUpdate(data) {
        if (!data.txt || !data.txt.length) return;
        let attributes = {};
        for( let i=0; i<data.txt.length; i++ ) {
            let[ key, value ] = data.txt[i].split('=',2);
            attributes[key]=value;
        }
        if (!attributes.hasOwnProperty('fn')) return;
        
        console.log('Found Chromecast: '+attributes.fn);

        attributes.host = data.host;
        registerPlayerCallback( new audioPlayer( attributes ), attributes.fn.toLowerCase() );
    });

    setTimeout(function onTimeout() {
        console.log('Finished looking for Chromecast devices');
        browser.stop();
    }, 5000);
}


module.exports = { passRegisterCallback : function(callback,theManager){ registerPlayerCallback = callback; manager = theManager; } }
