const { spawn } = require('child_process');
const fs = require('fs');

const pattern = require('./pattern.js');

const matchFunctions = {
};

const processFunctions = {
    'uppercase': function(str) { return str.toUpperCase(); },
};

/*
[pattern]
If only one pattern is included then this pattern is optional
If more than one pattern is included separated by pipe's (|) then one of the patterns must macth - one of the patterns can be the empty string to make the whole thing options - but this must be either the first of the last sub-match e.g. [|option 1|option 2] or [option 1|option 2|], but not [option 1||option 2]

[replacement:pattern]
If the square bracket starts with replacement text followed by a colon, then if the brackets match then the matching text is replaced by the replacement text
If a replacement is combined with the empty string match (i.e. [|option] or [option|] ) then the position of the empty string (at the start or end) is significant
- If the empty string is at the start (i.e. [|option] ) then the replacement text for will only be used for non-empty matches - i.e. if nothing in the square brackets matches the replacement text will not be inserted
- If the empty string is at the start (i.e. [option|] ) then the replacement text for will only be used for all matches - even if the "match" is actually matching on the empty string (i.e. nothing)

(storeMatchName:pattern)
If the pattern matches then the value of the match is stored and returned in the key specified by storeMatchName

{postProcessFunction:pattern}
The postProcessFunction specified is used to post-process the matching text 

<matchFunction:param1:param2>
The parameters are optional. If specified they will be passed to the function
The function is called repeatedly with different bits of text to see if the start of the text matches anything it knows about.
The function should return false if it doesn't recognise anything at the start of the text.
If it DOES recognise the start of the text then it should return an array of the possible matches.
Each match in the return array should either be whatever is left of the string that was past in after removing the matching bit, or an array consisting of whatever is left of the string that was past in after removing the matching bit PLUS the substitute text to be used for the match

The following built in match functions are defined
  <time>        : TODO - not implemented yet
  <date>        : TODO - not implemented yet
  <number>      : TODO - not implemented yet
  <theRest>     : everything from this point to the end of the utterance
  <stuff>       : a non-greedy match for anything. This can be either word based or characters based e.g <stuff:words> or <stuff:chars>
                  Using <stuff:words> is more efficient if you don't need to do per-character matching.
                  The :words variant is the default - i.e. it will use words if you just specify <stuff>
*/

const phrasebook = {
    please          : '[(polite:[please])]',
    canYou          : '[[can|could|will] you]',
}


const contexts = {
}

// load up all the capabilities
mapSubdirectories(__dirname+'/capabilities/',function(objectDir, objectName,type){
    if (!fs.existsSync(objectDir+objectName+'/index.js')) return;
    let capabilityData = require(objectDir+objectName);
    if (capabilityData.hasOwnProperty('phrasebook')) Object.assign(phrasebook, capabilityData.phrasebook);
    if (capabilityData.hasOwnProperty('matchFunctions')) Object.assign(matchFunctions, capabilityData.matchFunctions);
    if (capabilityData.hasOwnProperty('processFunctions')) Object.assign(matchFunctions, capabilityData.processFunctions);

    if (capabilityData.hasOwnProperty('capabilities')) {
        let capabilityList = capabilityData.capabilities;
        
        for (let capabilityIdx=0; capabilityIdx<capabilityList.length; capabilityIdx++) {
            let capability = capabilityList[capabilityIdx];
            if (capability.hasOwnProperty('incantation')) capability.incantations = [capability.incantation];
            if (capability.hasOwnProperty('context')) capability.contexts = [capability.context];

            if (capability.hasOwnProperty('contexts') && capability.hasOwnProperty('incantations') && capability.hasOwnProperty('handler')) {
                for (let contextIdx=0; contextIdx < capability.contexts.length; contextIdx++ ) {
                    let context = capability.contexts[contextIdx];
                    if (!contexts.hasOwnProperty(context)) contexts[context]=[];
                    for (let incantationIdx=0; incantationIdx<capability.incantations.length; incantationIdx++) {
                        contexts[context].push([
                            capability.incantations[incantationIdx],
                            capability.handler
                        ]);
                    }
                }
            }
        }
    }
});

for( let context in contexts ) {
    console.log('>',context);
    contexts[context] = new pattern.MultiPattern({
        commands:           contexts[context],
        phrasebook:         phrasebook,
        matchFunctions:     matchFunctions,
        processFunctions:   processFunctions,
    });
}

function Assistant( manager ) {
    this.manager = manager;
    this.listening = false;
    this.hearBuffer = '';
    this.listener = false;
    this.listenerStarted = false;
    this.spawnListener();
    this.currentContext = '';
    this.artificalUtterances = false;
}

Assistant.prototype.spawnListener = function() {

    if (this.listener) {
        this.listener.kill();
    }

    this.listener = spawn('python3',[__dirname+'/listener.py']);
    this.listener.stdin.setEncoding('utf-8');
    
    var self = this;
    this.listener.stdout.on('data',function(data) {
        self.hearBuffer += data.toString();
        crPos = self.hearBuffer.indexOf("\n");
        
        if (self.listening && crPos) {
            let heard = self.hearBuffer.substr( 0, crPos );
            self.hearBuffer = self.hearBuffer.substr( crPos+1 );
            self.heard( heard.trim() );
        }
    });
    this.listener.stderr.on('data',function(data) {
        data = data.toString().trim();
        if (!self.listenerStarted) {
            if (data.toString()=='STARTED') {
                self.listenerStarted=true;
                console.log('Listener started');
            }
        } else {
            console.log('Listener debug:'+data);
        }
    });
    this.listener.on('exit',function(){
        console.log('respawning listener');
        self.listenerStarted=false;
        self.spawnListener();
    })

    // If we were in the middle of listening when it died start listening again...
    if (this.listening) this.listen()
}

Assistant.prototype.offerTrigger = function(trigger,data) {
    // Assistant listens for 2 triggers
    // 1. wakeword
    // 2. assistant - the latter is a synthetic trigger which allows other things to use the assitant's ability to do things by
    //    skipping the bit where it listens for a command from the user and executes a command specified in the trigger data instead
    console.log('Assistant was offered: '+trigger);
    if (trigger=='wakeword' || trigger=='assistant') return true;
    return false;
}

Assistant.prototype.run = function( trigger, data ) {
    console.log('Running Assistant ')

    this.trigger = trigger;
    if (this.trigger=='wakeword') {
        this.manager.play('sounds/bleep.mp3');
        this.artificalUtterances = false;
    } else {
        // if the trigger is not "wakeword" then it must be "assistant"
        // in this case data is either an articial utterance - or an array of artificial utterances
        if (typeof(data)=='string') this.artificalUtterances = [ data ];
        else this.artificalUtterances = data;
    }
    this.listen();
}

Assistant.prototype.listen = function( ) {
    this.listening = true;
    if (this.artificalUtterances!==false) {
        if (this.artificalUtterances.length) this.heard( this.artificalUtterances.shift() );
        else this.heard('<timeout>');
    } else {
        let result = this.listener.stdin.write("listen\n");
        if (!result) console.log('Problem listening');
        else console.log('Assistant is listening');
    }
}

Assistant.prototype.done = function() {
    var self = this;
    console.log('Assistant finished');
    if (this.trigger=='wakeword') {
        this.manager.play('sounds/bloop.mp3',function(){
            // Wait for bloop to finish playing until we finally relinquish control
            self.manager.done();
        });
    } else {
        self.manager.done();
    }
}

const stopWords = [ 'timeout','nothing','cancel','cancel thanks','thats all','thats all thanks','stop','ok','ok thanks','forget it','thanks' ]
Assistant.prototype.heard = function( utterance ) {
    var self = this;
    this.listening = false;
    console.log('Assistant heard: ',utterance);
    
    // Remove punctuation etc
    utterance = utterance.toLowerCase().replace(/[^a-z0-9 ]+/g,'');

    // If they didn't say anything - or they said a stop work then stop listening
    if (!utterance.length || stopWords.includes( utterance )) {
        console.log('finishing');
		this.done();
		return false;
	}

    // This is where the magic happens!
    let validContexts = [];
    if (this.currentContext.length) {
        validContexts.push(this.currentContext);
        // see if the current context is exclusive (i.e. prevents stuff in the "main" context from happening)
        if (this.currentContext.substring(0,1)!='_') validContexts.push('main');
    } else {
        validContexts.push('main');
    }
    
    for( let i=0; i<validContexts.length; i++ ) {
        let result = contexts[validContexts[i]].match( utterance );

        // Handle recognized stuff first
        if ( typeof( result.handler ) == 'function' ) {
            // Call the handler passing the callback for them to call when they are finished
            let newContext = result.handler( result.textMatchData, this.manager, function() {
                self.listen();
            });
            if (typeof(newContext)=='string' && newContext.length) this.currentContext = newContext;
            else this.currentContext = '';
            return true;
        }
    }

	// Didn't recognize the utterance - or no handler defined
    this.manager.say('Sorry. I don\'t understand.',true,function(){ self.listen(); });
    return false;    
}

module.exports = Assistant;
