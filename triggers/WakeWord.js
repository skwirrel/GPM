const { spawn } = require('child_process');

function WakeWord( manager ) {
	console.log('Starting up trigger handler');
	this.process = spawn('python3',['triggers/awakener.py']);
	console.log('Trigger handler started');
	this.process.stdout.on('data',function(data){
		console.log('Got data: '+data.toString().trim());
		manager.enqueue('Assistant',data.toString());
	})
	this.process.stderr.on('data',function(data){
        // don't do anything with the errors
    });
}

module.exports = WakeWord;
