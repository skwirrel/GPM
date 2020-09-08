const triggers = [];
const tasks = [];
const { spawn } = require('child_process');

function Manager() {
	this.queue = [];
	this.busy = false;
	this.running = '';
	this.sayCallbackStack=[];
	
	var self = this;
	
	this.listener = spawn('python3',['speaker.py']);
	this.listener.stderr.on('data',function(data){
		console.log('speaker.py returned errors: '+data);
	})
	
	this.listener.stdout.on('data',function(data){
		console.log('Speaker responded: '+data);
		if (self.sayCallbackStack.length) self.sayCallbackStack.pop()();
	})
}

Manager.prototype.say = function( utterance, chachable, callback ) {
	this.sayCallbackStack.push(callback);

	chachable = chachable ? 'cache':'nocache';
	
	console.log('Saying: '+utterance);
	this.listener.stdin.write( chachable+':'+utterance+"\n" );
}

Manager.prototype.play = function( file, callback  ) {
    let child = spawn('/usr/bin/play', [file]);
    if (callback) {
        child.on('exit',callback);
    }
}


Manager.prototype.runTask = function( task, ...args ) {
    if (typeof(tasks[task])=='undefined') return false;
    tasks[task].run.apply(tasks[task], args);
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
	
	if (typeof(tasks[task])=='undefined') return false;
	this.busy++;
	if (this.busy>1) {
		// If somehow something else started running then abort and back off for a short random time
		this.busy--;
		var self = this;
		setTimeout( function(){self.processQueue()}, Math.random(100) );
	} else {
		this.running = task;
        // if one job is running straight after another add a slight pause inbetween
        setTimeout(function(){ tasks[task].run.apply( tasks[task],taskArguments ); },justFinishedPreviousJob?500:0);
	}
}

Manager.prototype.done = function() {
	console.log('Finished running: '+this.running);
	this.busy--;
	this.running = '';
	this.processQueue(true);
}


var manager = new Manager();


// Load in and initialisae all the tasks
let task = require('./tasks/Assistant.js');
tasks['Assistant'] = new task( manager );

// Load in and initialisae all the triggers
let triggerHandler = require('./triggers/WakeWord.js');
triggers.push( new triggerHandler( manager ) );

spawn('/usr/bin/play', ['sounds/ready.mp3']);


