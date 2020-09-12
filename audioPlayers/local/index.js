const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
    
function audioPlayer(  ) {
    this.startPlayer();
    this.buffer = '';
    this.playing = false;
    this.playlist = [];
}

audioPlayer.prototype.startPlayer = function() {
    var self = this;
    
	console.log('Starting up local audio player');
	this.process = spawn('mplayer',['-slave','-quiet','-pausing','2','-nolirc','-nomouseinput','-idle']);

    var justStarted = true;
	this.process.stdout.on('data',function(data){
		console.log('Output from mplayer: '+data.toString().trim());

        if (justStarted) {
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
    this.sendCommand('volume '+percent+' 1');
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
    this.getResponse( function(line){
        self.surpressNextError=false;
        if (line=='ANS_ERROR=PROPERTY_UNAVAILABLE') return callback( '' );
        if (line.substring(0,9)!='ANS_path=') return callback( false );
        line=line.substring(9);
        console.log(line);
        for( let i=0; i<self.playlist.length; i++ ) {
            if (line==self.playlist[i].filename) {
                return callback( self.playlist[i] );
            }
        }
        console.log("Couldn't find current playing file in the playlist");
        callback( false );
    } );
    this.surpressNextError=true;
    this.sendCommand('get_property path');
}

audioPlayer.prototype.play = function() {
    if (this.playing) return;
    this.playing=true;
    this.sendCommand('pause');
}

audioPlayer.prototype.pause = function() {
    if (!this.playing) return;
    this.playing=false;
    this.sendCommand('pause');
}

audioPlayer.prototype.next = function() {
    this.sendCommand('pt_step +1');
}

audioPlayer.prototype.previous = function() {
    this.sendCommand('pt_step -1');
}

audioPlayer.prototype.makeTemporaryPlaylist = function( tracks ) {
    let trackList = tracks.map( track => track.filename ).join("\n");
    
    if (!trackList.length) return false;
    
    // Create the temporary file
    const tempPath = path.join(os.tmpdir(), 'playlist-');
    const tempDir = fs.mkdtempSync(tempPath)
    const tempFile = tempDir+'/playlist.m3u8';
    console.log('Create temporary playlist: '+tempFile);
    fs.writeFileSync(tempFile, trackList);
    
    setTimeout(function() {
        console.log('Deleted temporary playlist: '+tempFile);
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
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

module.exports = { 'local': player };
