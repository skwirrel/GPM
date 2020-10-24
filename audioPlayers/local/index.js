const { spawn, exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

var manager;

function audioPlayer(  ) {
    this.startPlayer();
    this.buffer = '';
    this.interupted = 0;
    this.status = 'stopped';
    this.playlist = [];
    this.name = 'local';
}

audioPlayer.prototype.startPlayer = function() {
    var self = this;
    
	console.log('Starting up local audio player');
	this.process = spawn('mplayer',['-slave','-quiet','-pausing','2','-nolirc','-nomouseinput','-idle','-volume','50']);

    var justStarted = true;
	this.process.stdout.on('data',function(data){
		console.log('Output from mplayer: '+data.toString().trim());

        if (justStarted) {
            // Tell Mplayer to play at full volume
            self.setVolume(50);
             
        }
        justStarted=false;

        self.buffer += data.toString();
        while (self.buffer.substring(0,1)==="\n") { self.buffer = self.buffer.substring(1); }

        let crPos = self.buffer.indexOf("\n");
        if (self.onLine && crPos) {
            let line = self.buffer.substr( 0, crPos );
            self.buffer = self.buffer.substr( crPos+1 );
            let handler = self.onLine;
            self.onLine = false;
            handler(line);
        }
        
	})

	this.process.stderr.on('data',function(data){
        if (!self.surpressNextError) console.log('mplayer generated error: '+data.toString());
        else self.surpressNextError=false;
    });
}

audioPlayer.prototype.getResponse = function( callback ) {
    this.buffer = '';
    this.onLine = callback;
}
    
audioPlayer.prototype.sendCommand = function( command ) {
    console.log('Sending command to mplayer: '+command);
    this.process.stdin.write(command+"\n");
}

audioPlayer.prototype.setVolume = function( percent ) {
    // Don't change the mplayer volume
    //this.sendCommand('volume '+percent+' 1');

    // Use the master volume control instead
    let cmd = "pactl set-sink-volume @DEFAULT_SINK@ "+parseInt(percent)+"%";
    console.log("Running: "+cmd);
    exec(cmd, (error, stdout, stderr) => {
        if (error) console.log(`pactl error: ${error.message}`);
        if (stderr) console.log(`pactl stderr: ${stderr}`);
        if (stdout) console.log(`pactl stdout: ${stdout}`);
    });

    this.volume=percent;
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
    var self = this;
    if (this.status=='stopped') return callback( false );
    this.getResponse( function(line){
        self.surpressNextError=false;
        if (line=='ANS_ERROR=PROPERTY_UNAVAILABLE') {
            this.status=='stopped'
            return callback( '' );
        }
        if (line.substring(0,9)!='ANS_path=') return callback( false );
        line=line.substring(9);
        for( let i=0; i<self.playlist.length; i++ ) {
            if (line==self.playlist[i].url) {
                return callback( self.playlist[i], i );
            }
        }
        console.log("Couldn't find current playing file in the playlist");
        callback( false );
    } );
    this.surpressNextError=true;
    this.sendCommand('get_property path');
}

audioPlayer.prototype.interupt = function() {
    this.interupted++;
    console.log('Interupting local audio playback');
    if (this.interupted==1 && this.status=='playing') {
        this.sendCommand('pause');
    }
}

audioPlayer.prototype.resume = function() {
    this.interupted--;
    console.log('Resuming local audio playback');
    if (this.interupted==0 && this.status=='playing') {
        this.sendCommand('pause');
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
    this.sendCommand('pause');
    return true;
}

audioPlayer.prototype.pause = function() {
    if (this.status!='playing') return false;
    this.status='paused';
    if (this.interupted) return false;
    this.sendCommand('pause');
    return true;
}

audioPlayer.prototype.next = function() {
    this.sendCommand('pt_step +1');
}

audioPlayer.prototype.previous = function() {
    this.sendCommand('pt_step -1');
}

audioPlayer.prototype.makeTemporaryPlaylist = function( tracks ) {
    let trackList = tracks.map( track => track.url ).join("\n");
    
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

audioPlayer.prototype.enqueue = function( tracks, append=false ) {
    if (append) this.playlist.push(...tracks);
    else this.playlist=tracks;
    let tempPlaylist=this.makeTemporaryPlaylist(tracks);
    if (!tempPlaylist.length) {
        console.log('Local audio player failed to create playlist');
    } else {
        this.sendCommand('loadlist '+tempPlaylist+(append?' 1':''));
    }
}

audioPlayer.prototype.shutdown = function( ) {
    console.log('Killing local audio player');
    this.process.kill();
}

var player = new audioPlayer();

process.on('exit', (code) => {
    player.shutdown();
});

module.exports = { passRegisterCallback : function( callback, theManager ) { manager = theManager; callback( player,'local') } };
