const { spawn } = require('child_process');

function WakeWord( manager ) {
	console.log('Starting up trigger handler');
	this.process = spawn('python3',['triggers/porcupine.py']);
	console.log('Trigger handler started');
	this.process.stdout.on('data',function(data){
		console.log('Got data: '+data.toString().trim());
		manager.enqueueTask('Assistant',data.toString());
	})
	this.process.stderr.on('data',function(data){
        // don't do anything with the errors
    });
}

module.exports = WakeWord;
