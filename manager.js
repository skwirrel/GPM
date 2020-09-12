// I'm fairly sure the way we do a lot of long-running asynchronous reads on processes/files means we will need to bump up the thread pool
// https://stackoverflow.com/questions/22644328/when-is-the-thread-pool-used
// https://kariera.future-processing.pl/blog/on-problems-with-threads-in-node-js/
// I'm fairly sure 100 should be more than we'll ever need - unless someone creates a crazy number of FIFO triggers
// This has to be set BEFORE any of the thread are used so we do it right at the top of the script
process.env.UV_THREADPOOL_SIZE = 100;

const config = require('./configLoader.js')({},process.argv.pop());

const { spawn } = require('child_process');
const fs = require('fs');

function Manager() {
	this.routes = [];
    this.tasks = [];
    this.triggers = [];
    this.audioPlayers = [];
    this.queue = [];
	this.busy = false;
	this.running = '';
	this.sayCallbackStack=[];
	
    // Start up the TTS engine;
    this.startTts();
}

Manager.prototype.startTts = function() {
        
	var self = this;

    let ttsConfig = config.ttsEngine;
    let dontRespawn=true;
    setTimeout(()=>dontRespawn=false,1000);
	
	this.tts = spawn(ttsConfig.shift(),ttsConfig);
	this.tts.stderr.on('data',function(data){
		console.log('TTS returned errors: '+data);
	});
	
	this.tts.stdout.on('data',function(data){
		console.log('TTS responded: '+data);
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

Manager.prototype.play = function( file, callback  ) {
    let child = spawn('/usr/bin/play', [file]);
    if (callback) {
        child.on('exit',callback);
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
    this[type+'s'][name] = thing;
}

Manager.prototype.trigger = function( trigger, data ) {
    trigger = trigger.toLowerCase().trim();
    
    for( let task in this.tasks ) {
        if (this.tasks[task].offerTrigger( trigger, data )) {
            this.enqueueTask( task, trigger, data );
        }
    }
}

Manager.prototype.audioPlayer = function( player, command, ...args ) {
    if (typeof(this.audioPlayers[player])=='undefined') {
        console.log('Ignoring command for unrecognised audio player: '+player);
        return false;
    }
    return this.audioPlayers[player][command](...args);
}

var manager = new Manager();

global.mapSubdirectories = function(source,callback,...args) {
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name.substring(0,1)!='.')
        .map(dirent => callback(source,dirent.name,...args))
}

function loadObject(objectDir, objectName,type){
    if (!fs.existsSync(objectDir+objectName+'/index.js')) return;
    let result = require(objectDir+objectName);
    if (type=='audioPlayer') {
        for( let player in result ) {
            manager.register(type, result[player],player);
        }
    } else {
        manager.register(type, new result( manager ),objectName);
    }
}

mapSubdirectories('./tasks/',loadObject,'task');
mapSubdirectories('./triggers/',loadObject,'trigger');
mapSubdirectories('./audioPlayers/',loadObject,'audioPlayer');

console.log(manager.audioPlayers);

// Load in and initialisae all the
spawn('/usr/bin/play', ['sounds/ready.mp3']);


