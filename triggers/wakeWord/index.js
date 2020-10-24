const { spawn } = require('child_process');

function wakeWord( manager ) {
    this.manager = manager;
    this.startup();
}

wakeWord.prototype.startup = function() {
    let self = this;
	console.log('Starting up wakeword trigger');
	this.process = spawn('python3',[__dirname+'/porcupine.py']);
	this.process.stdout.on('data',function(data){
		console.log('Detected wake word: '+data.toString().trim());
		self.manager.trigger('wakeword',{wakeWord:data.toString()},function(){self.startup()});
	})
    var surpressStartupErrors = true;
    // pyaudio spews errors on startup which are impossible to surpress - so ignore these here
    setTimeout( () => surpressStartupErrors=false ,1000 );
	this.process.stderr.on('data',function(data){
        if (!surpressStartupErrors) console.log('Porcupine generated error: '+data.toString());
    });
}

module.exports = wakeWord;
