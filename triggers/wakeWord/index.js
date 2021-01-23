const config = require('../../configLoader.js')({},__filename);

const { spawn } = require('child_process');
const fs = require('fs');

function wakeWord( manager ) {
    this.manager = manager;
    this.recorder = false;
    this.listener = false;
    this.triggerBaseData = {};
    this.startup();
}

wakeWord.prototype.listen = function() {
    let self = this;

	this.listener = spawn('python3',[__dirname+'/porcupine.py']);
	this.listener.stdout.on('data',function(data){
		console.log('Detected wake word: '+data.toString().trim());
        let triggerData = { ...self.triggerBaseData };
        triggerData.wakeWord = data.toString();
		self.manager.trigger('wakeword',triggerData,function(){self.listen()});
	})
    var surpressStartupErrors = true;
    // pyaudio spews errors on startup which are impossible to surpress - so ignore these here
    setTimeout( () => surpressStartupErrors=false ,1000 );
	this.listener.stderr.on('data',function(data){
        if (!surpressStartupErrors) console.log('Porcupine generated error: '+data.toString());
    });

}

wakeWord.prototype.startup = function() {
    let self = this;
	console.log('Starting up wakeword trigger');

    // See if there are directories to save recordings to
    this.recordFalseNegative = config.wakeWordFalseNegativeDir.length && fs.existsSync(config.wakeWordFalseNegativeDir);
    this.recordFalsePositive = config.wakeWordFalsePositiveDir.length && fs.existsSync(config.wakeWordFalsePositiveDir);
    this.recordTruePositive = config.wakeWordTruePositiveDir.length && fs.existsSync(config.wakeWordTruePositiveDir);

    if (this.recordFalseNegative) this.triggerBaseData.wakeWordFalseNegativeRecordCallback = function(){ self.record('FalseNegative'); }
    if (this.recordFalsePositive) this.triggerBaseData.wakeWordFalsePositiveRecordCallback = function(){ self.record('FalsePositive'); }
    if (this.recordTruePositive) this.triggerBaseData.wakeWordTruePositiveRecordCallback = function(){ self.record('TruePositive'); }

    if (this.recordFalseNegative || this.recordFalsePositive || this.recordTruePositive) {
        this.recorder = spawn('python3',[__dirname+'/retrorecord.py']);
        this.recorder.stdout.on('data',function(data){
            console.log('Retrorecord said: '+data.toString().trim());
        })

        var surpressStartupErrors = true;
        // pyaudio spews errors on startup which are impossible to surpress - so ignore these here
        setTimeout( () => surpressStartupErrors=false ,1000 );

        this.recorder.stderr.on('data',function(data){
            if (!surpressStartupErrors) console.log('Retrorecord generated error: '+data.toString());
        });
        this.recorder.stdout.on('data',function(data){
            console.log('Retrorecord said: '+data.toString());
        });
    }

    this.listen();
}

wakeWord.prototype.record = function(which) {
    if (!this.recorder) return false;
    if (!this['record'+which]) return false;
    
    let filename = config['wakeWord'+which+'Dir'] + '/' + (new Date()).getTime();
    this.recorder.stdin.write(filename+"\n");
}

module.exports = wakeWord;
