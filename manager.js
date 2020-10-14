// I'm fairly sure the way we do a lot of long-running asynchronous reads on processes/files means we will need to bump up the thread pool
// https://stackoverflow.com/questions/22644328/when-is-the-thread-pool-used
// https://kariera.future-processing.pl/blog/on-problems-with-threads-in-node-js/
// I'm fairly sure 100 should be more than we'll ever need - unless someone creates a crazy number of FIFO triggers
// This has to be set BEFORE any of the thread are used so we do it right at the top of the script
process.env.UV_THREADPOOL_SIZE = 100;

const config = require('./configLoader.js')({},process.argv.pop());

// Various things need to know the IP address of this server
const networkInterfaces = require('os').networkInterfaces();

global.myIp = false;

if (config.myIP) {
    global.myIp = config.myIP;
} else {
    for (let name in networkInterfaces) {
        for (let net of networkInterfaces[name]) {
            console.log(net);
            // skip over non-ipv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family.toLowerCase() === 'ipv4' && !net.internal) {
                global.myIp = net.address;
                console.log('Automatically determined IP address of this machine as: '+global.myIp);
                if (config.netmask) global.myCidr = global.myIp+'/'+global.netmask;
                else {
                    global.myCidr = net.cidr;
                    console.log('Automatically determined CIDR netblock as: '+global.myCidr);
                }
                break
            }
        }
    }
}

const { spawn } = require('child_process');
const fs = require('fs');
const deviceFinder = require('./deviceFinder.js');
const httpFileServer = require('./httpFileServer.js');

function Manager() {
	this.routes = [];
    this.tasks = [];
    this.triggers = [];
    this.audioPlayers = [];
    this.queue = [];
	this.busy = false;
	this.running = '';
    this.sayCallbackStack=[];
    this.devices = new deviceFinder();
    this.httpFileServer = new httpFileServer();
	
    // Start up the TTS engine;
    this.startTts();
}

Manager.prototype.serveFile = function( filename ) {
    return this.httpFileServer.serveFile( filename );
}

Manager.prototype.startTts = function() {
        
	var self = this;

    let ttsConfig = config.ttsEngine;
    let dontRespawn=true;
    setTimeout(()=>dontRespawn=false,1000);
	
	this.tts = spawn(ttsConfig.shift(),ttsConfig);
	this.tts.stderr.on('data',function(data){
		console.log('TTS returned errors: '+data.toString().trim());
	});
	
	this.tts.stdout.on('data',function(data){
		console.log('TTS responded: '+data.toString().trim());
		if (self.sayCallbackStack.length) self.sayCallbackStack.pop()();
	});

	this.tts.on('close',function(data){
        if (dontRespawn) {
            console.error('TTS engine died immediately after starting - something is wrong');
            // If anyone (e.g. the FIFO trigger) is using createReadStream then this stops process.exit from working
            // So kill ourselves instead
            process.kill( process.pid, 'SIGTERM' );
        } else {
            self.startTts();
        }
    });
}

Manager.prototype.say = function( utterance, chachable, callback ) {
	this.sayCallbackStack.push(callback);

	chachable = chachable ? 'cache':'nocache';
	
	console.log('Saying: '+utterance);
	this.tts.stdin.write( chachable+':'+utterance+"\n" );
}

// Plays a file - returns a function which can be called to stop the audio playback
Manager.prototype.play = function( file, callback, repeat=1  ) {
    console.log('Playing audio: '+file);
    let args = [file];
    if (repeat>1) args.push('repeat',repeat);
    let child = spawn('/usr/bin/play', args);
    
    if (callback) {
        child.on('exit',callback);
    }
    return function(){
        child.kill( 'SIGINT' );
    }
}


Manager.prototype.runTask = function( task, ...args ) {
    if (typeof(this.tasks[task])=='undefined') return false;
    this.tasks[task].run.apply(this.tasks[task], args);
}

Manager.prototype.enqueueTask = function( ...args ) {
	this.queue.push( args );
	if (!this.busy) this.processQueue();
}

Manager.prototype.processQueue = function( justFinishedPreviousJob ) {
	if (this.busy) return false;
	if (!this.queue.length) return false;
	
	let taskArguments = this.queue.shift();
    let task = taskArguments.shift();
	
	if (typeof(this.tasks[task])=='undefined') return false;
	this.busy++;
    var self = this;
	if (this.busy>1) {
		// If somehow something else started running then abort and back off for a short random time
		this.busy--;
		setTimeout( function(){self.processQueue()}, Math.random(100) );
	} else {
		this.running = task;
        // if one job is running straight after another add a slight pause inbetween
        setTimeout(function(){ self.tasks[task].run.apply( self.tasks[task],taskArguments ); },justFinishedPreviousJob?500:0);
	}
}

Manager.prototype.done = function() {
	console.log('Finished running: '+this.running);
	this.busy--;
	this.running = '';
	this.processQueue(true);
}

Manager.prototype.register = function(type, thing, name) {
    if (type=='device') this.devices.register(name, thing);
    else this[type+'s'][name] = thing;
    console.log('Registering new '+type+': '+name);
}

Manager.prototype.trigger = function( trigger, data ) {
    trigger = trigger.toLowerCase().trim();
    
    for( let task in this.tasks ) {
        if (this.tasks[task].offerTrigger( trigger, data )) {
            this.enqueueTask( task, trigger, data );
        }
    }
}

let localSpeakerRegexp = /^(this speaker|this device|here)$/;
Manager.prototype.findAudioPlayer = function( player ) {
    if (player==='' || typeof(player)=='undefined') return 'local';
    if (player.match(localSpeakerRegexp)) return 'local';
    prefixes = ['','the','speaker in the','chromecast in the'];
    suffixes = ['','speaker','chromecast'];

    for (let prefix of prefixes) {
        for (let suffix of suffixes) {
            let name = (prefix.length?prefix+' ':'')+player+(suffix.length?' '+suffix:'');
            console.log('Looking for '+name+' amongst'+Object.keys(this.audioPlayers));
            if (this.audioPlayers.hasOwnProperty( name )) return name;
        }
    }
    return false;
}

Manager.prototype.audioPlayer = function( player, command, ...args ) {
    
    player = player.toLowerCase();
    if (typeof(this.audioPlayers[player])=='undefined') {
        console.log('Ignoring command for unrecognised audio player: '+player);
        return false;
    }
    // if the command is "enqueue" then convert any track paths to track URLs by serving up the files through our web server
    if (command=='enqueue') {
        for( let track of args[0] ) {
            if (!track.hasOwnProperty('url')) track.url = this.serveFile( track.path );
        }
    }
    return this.audioPlayers[player][command](...args);
}

Manager.prototype.activePlayers = function( status='playing' ) {
    let nowPlaying = [];
    for( let player in this.audioPlayers ) {
        console.log('>>>'+player+this.audioPlayers[player].getStatus()+' cf '+status);
        if (this.audioPlayers[player].getStatus()==status) nowPlaying.push(player);
    }
    return nowPlaying;
}

// Returns a hash of all the players which are currently actually playing something
// Hash is keyed on player name and value is the track object
Manager.prototype.nowPlaying = function(callback) {
    let nowPlaying = {};
    let activePlayers = this.activePlayers();
    let waitingFor = activePlayers.length;
    if (!waitingFor) return callback(false);
    for( let player of activePlayers ) {
        this.audioPlayers[player].nowPlaying(function(playing){
            waitingFor--;
            if (typeof(playing) =='object') nowPlaying[player] = playing;
            if (!waitingFor) callback(nowPlaying);
        });
    }
}

var manager = new Manager();

global.mapSubdirectories = function(source,callback,...args) {
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name.substring(0,1)!='.')
        .map(dirent => callback(source,dirent.name,...args))
}

function loadObject(objectDir, objectName,type){
    console.log('Loading '+type+': '+objectName);
    if (!fs.existsSync(objectDir+objectName+'/index.js')) return;
    let result = require(objectDir+objectName);

    // If the included files sets up its things asynchronously then it can't return the object straight away.
    // Instead it returns a function then we can pass callback to which it can use to register its objects
    // However, there is no way to tell the difference between a constructor and a plain function.
    // So if the included file wants to do things asynchronously then it returns an object instead
    if (typeof(result)=='object') {
        result.passRegisterCallback(function(object,name){
            manager.register(type,object,name)
        },manager);
    } else {
        manager.register(type, new result( manager ),objectName);
    }
}

// Load in and initialisae all the tasks, triggers and audio player
mapSubdirectories('./tasks/',loadObject,'task');
mapSubdirectories('./triggers/',loadObject,'trigger');
mapSubdirectories('./audioPlayers/',loadObject,'audioPlayer');
mapSubdirectories('./devices/',loadObject,'device');

spawn('/usr/bin/play', ['sounds/ready.mp3']);

setTimeout(function() {
    console.log('Setup phase complete\n===================================\n');
},1000);
