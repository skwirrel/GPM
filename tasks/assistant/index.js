const { spawn } = require('child_process');
const fs = require('fs');

const pattern = require('./pattern.js');

const matchFunctions = {
};

const processFunctions = {
    'uppercase': function(str) { return str.toUpperCase(); },
};

const stopWords = [ 'timeout','nothing','cancel','cancel thanks','thats all','thats all thanks','ok','ok thanks','forget it','thanks' ]

/*
[pattern]
If only one pattern is included then this pattern is optional
If more than one pattern is included separated by pipe's (|) then one of the patterns must macth - one of the patterns can be the empty string to make the whole thing options - but this must be either the first or the last sub-match e.g. [|option 1|option 2] or [option 1|option 2|], but not [option 1||option 2]

[replacement:pattern]
If the square bracket starts with replacement text followed by a colon, then if the brackets matches then the matching text is replaced by the replacement text
If a replacement is combined with the empty string match (i.e. [|option] or [option|] ) then the position of the empty string (at the start or end) is significant
- If the empty string is at the start (i.e. [|option] ) then the replacement text will only be used for non-empty matches - i.e. if nothing in the square brackets matches the replacement text will not be inserted
- If the empty string is at the start (i.e. [option|] ) then the replacement text will only be used for all matches - even if the "match" is actually matching on the empty string (i.e. nothing)

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
    commandHeader   : '[(polite:[please])] [[can|could|will] you]',
    commandTrailer  : '[for me] [(polite:[please])]',

    // Use these if the TTS engine returns numbers as words
    // Numbers
    singleDigitIntegerWords     : '[a|one|two|three|four|five|six|seven|eight|nine]',
    doubleDigitIntegerWords     : '[[$singleDigitIntegerWords|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen]|[twenty|thirty|fourty|fifty|sixty|seventy|eighty|ninety] [|$singleDigitIntegerWords]]',
    tripleDigitIntegerWords     : '[$doubleDigitIntegerWords|[$singleDigitIntegerWords|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen] hundred [[and] $doubleDigitIntegerWords]|$singleDigitIntegerWords $doubleDigitIntegerWords]',
    // Durations
    secondsDurationWords : '$number1To999999 second[s]',
    minutesDurationWords : '[$secondsDurationWords|$tripleDigitIntegerWords minute[s] [[and] $secondsDurationWords]]',
    hoursDurationWords : '[$minutesDurationWords|$doubleDigitIntegerWords hour[s] [[and] $minutesDurationWords]]',
    daysDurationWords : '[$hoursDurationWords|$tripleDigitIntegerWords day[s] [[and] $hoursDurationWords]]',

    // Use these if the TTS engine returns numbers as digits
    secondsDuration : '[[1:a|one]|<number:1>] second[s]',
    minutesDuration : '[$secondsDuration|[[1:a|one]|<number:1>] minute[s] [[and] $secondsDuration]]',
    hoursDuration : '[$minutesDuration|[[1:an|one]|<number:1>] hour[s] [[and] $minutesDuration]]',
    daysDuration : '[$hoursDuration|[[1:a|one]|<number:1>] day[s] [[and] $hoursDuration]]',
    
    timeOfDay : '[0][0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|midnight|midday][[0|1|2|3|4|5][0|1|2|3|4|5|6|7|8|9]] [oclock] [|am|pm] [|today|tomorrow]',
    
    delayStart : '[(ignoreDelay:ignore delay)] [in (delayStartDuration:$daysDuration) [time]]',
    autoStop : '[for (actionDuration:$daysDuration)]',
    
    singleDigitInteger : '[0|1|2|3|4|5|6|7|8|9]',
    doubleDigitInteger : '$singleDigitInteger[$singleDigitInteger]',
    tripleDigitInteger : '$doubleDigitInteger[$singleDigitInteger]',
    percentage : '[$doubleDigitInteger|100][%| percent]',
}

function exhaustiveReplace( str, regex, replacement ) {
    let newStr=str;
    do {
        str=newStr
        newStr = str.replace(regex,replacement);
    } while ( newStr !== str );
    return newStr;
}

const numberLookup = {
    a:1,one:1,to:2,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,fourty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,million:1000000
}

function convertNumber(str) {
    if (typeof(str)=='number') return str;
    if (str.match(/^[0-9]+$/)) return parseInt(str);
    let parts = str.split(/\s+/g);
    parts = parts.map(part=>numberLookup.hasOwnProperty(part)?numberLookup[part]:part);
    number = parts.join(' ').replace(/\b(\d)0 (\d)\b/g,'$1$2');
    number = number.replace(/\b1(0+) 1(0+)\b/g,'1$1$2');
    number = exhaustiveReplace( number, /(\d+) (\d+00+) and (\d{1,2})/g, function(match,p1,p2,p3){ replaced=true; return parseInt(p1)*parseInt(p2)+parseInt(p3)});
    number = exhaustiveReplace(number,/\b(\d+) 1(0+)\b/g,'$1$2');
    number = exhaustiveReplace( number, /\b(\d+)000 (\d{1,3}\b)/g, '$1$2');
    number = exhaustiveReplace( number, /\b(\d+)000000 (\d{1,6}\b)/g, '$1$2');
    number = exhaustiveReplace( number, /\b(\d+) (\d+)\b/g, '$1$2');
    return number;
}

const durationLookup = {
    second:1,minute:60,hour:3600,day:86400
}

function convertDuration(duration) {
    duration = convertNumber(duration);
    var total=0;
    duration.replace(/\b(\d+)\s+(second|hour|minute|day)s?\b/g,function(match,p1,p2){ total+=durationLookup.hasOwnProperty(p2)?parseInt(p1)*durationLookup[p2]:0 } );
    return total;
}

const timeRegexp = /^(\d{1,2}?|midday|midnight):?(\d{2})?\s*(am|pm)?\s*(today|tomorrow)?\s*$/;
function convertTime(time) {
    let results = time.match( timeRegexp );
    console.log(results);
    let hour = results[1];
    if (hour=='midday') hour=12;
    if (hour=='midnight') hour=0;
    hour=parseInt(hour);
    let minute = results[2]?parseInt(results[2]):0;
    if (results[3]=='pm' && hour<12) hour+=12;
    if (hour<10) hour = '0'+hour;
    if (minute<10) minute = '0'+minute;
    
    const now = new Date().getTime();
    let day,timestamp;
    if (results[4]=='tomorrow') {
        day = new Date(now+86400000).toJSON().substr(0,10);
    } else {
        day = new Date(now).toJSON().substr(0,10);
        timestamp = new Date(day+' '+hour+':'+minute).getTime() - now;
        if (timestamp<0) day = new Date(now+86400000).toJSON().substr(0,10);
    }
    return new Date(day+' '+hour+':'+minute).getTime() / 1000;
}
    
automaticMatchProcessors = {
    Duration    : convertDuration,
    Number      : convertNumber,
    Time        : convertTime,
}

const contexts = {
}

let capabilityStartupHandlers = [];

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
            if (!capability.hasOwnProperty('context') && !capability.hasOwnProperty('contexts')) capability.contexts = ['main'];

            if (capability.hasOwnProperty('contexts') && capability.hasOwnProperty('incantations') && capability.hasOwnProperty('handler')) {
                for (let contextIdx=0; contextIdx < capability.contexts.length; contextIdx++ ) {
                    let context = capability.contexts[contextIdx];
                    if (!contexts.hasOwnProperty(context)) contexts[context]=[];
                    for (let incantationIdx=0; incantationIdx<capability.incantations.length; incantationIdx++) {
                        contexts[context].push([
                            '$commandHeader '+capability.incantations[incantationIdx]+' $commandTrailer',
                            capability.handler
                        ]);
                    }
                }
            }
        }
    }
    
    if (capabilityData.hasOwnProperty('startup')) capabilityStartupHandlers.push( capabilityData.startup );

});

for( let context in contexts ) {
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
    this.artificialUtterances = false;
    this.onNextWakeActions = [];
    this.contextHandlesStop = false;
    this.resumeAudio=false;
    
    // Now that we have the manager we can run all the startup handlers for the capabilities
    while (capabilityStartupHandlers.length) {
        capabilityStartupHandlers.pop()(manager);
    }
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

Assistant.prototype.onNextWake = function( action ) {
    this.onNextWakeActions.push(action);
}

Assistant.prototype.run = function( trigger, data ) {
    console.log('Running Assistant ');
    let self = this;
    this.currentContext='';
    this.delayStart=0;
    
    this.trigger = trigger;
    this.triggerData = data;
    if (this.trigger=='wakeword') {
        this.manager.play('sounds/bleep.mp3');
        this.artificialUtterances = false;
    } else {
        // if the trigger is not "wakeword" then it must be "assistant"
        // in this case data is either an articial utterance - or an array of artificial utterances
        if (typeof(data)=='string') this.artificialUtterances = [ data ];
        else this.artificialUtterances = data;
    }

    // Actually start listening once all the onNextWake actions are complete
    this.onNextWakeActions.unshift(function(){ self.listen(); });
    
    let doNextWakeAction = function() {
        if (self.onNextWakeActions.length>1) console.log('Doing onNextWake action');
        (self.onNextWakeActions.pop())(doNextWakeAction);
    }

    doNextWakeAction();    
}

Assistant.prototype.listen = function( ) {
    this.listening = true;
    if (typeof(this.artificialUtterances)!='undefined' && this.artificialUtterances!==false) {
        if (this.artificialUtterances.length) this.heard( this.artificialUtterances.shift() );
        else this.heard('<timeout>');
    } else {
        let self = this;
        setTimeout(function(){
            self.resumeAudio = self.manager.interuptAudio();
            let result = self.listener.stdin.write("listen\n");
            if (!result) console.log('Problem listening');
            else console.log('Assistant is listening');
        },500);
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

Assistant.prototype.heard = function( utterance ) {
    var self = this;
    this.listening = false;
    console.log('Assistant heard: ',utterance);
    if (this.resumeAudio) this.resumeAudio();
    this.resumeAudio=false;
    
    // Remove punctuation etc
    utterance = utterance.toLowerCase().replace(/[^a-z0-9% ]+/g,'');

    // If they didn't say anything - or they said a stop word then stop listening
    // but not if the last handler put us in a context where it wants to handle stop words
    if (!this.contextHandlesStop && (!utterance.length || stopWords.includes( utterance ))) {
        console.log('finishing');

        // Record this as a false positive
        if (typeof(this.triggerData)=='object' && this.triggerData.hasOwnProperty('wakeWordFalsePositiveRecordCallback')) this.triggerData.wakeWordFalsePositiveRecordCallback();

		this.done();
		return false;
	}
    this.contextHandlesStop=false;

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

            console.log('Trigger data',this.triggerData);
            // Looks like we've got a true positive hit on the wakeWord
            if (typeof(this.triggerData)=='object' && this.triggerData.hasOwnProperty('wakeWordTruePositiveRecordCallback')) this.triggerData.wakeWordTruePositiveRecordCallback();
            
            if (result.textMatchData.ignoreDelay) delete result.textMatchData.delayStartDuration;
            
            /* The handler is passed a callback. The handler must EITHER
                1. Call the callback it is passed
                2. Return an object (even if only an empty one) and NOT call the callback
                The handler must do one or other of these, BUT NOT BOTH.
                OR
                3. Return a string and NOT call the callback - the string is taken to be the response to the user,
                   all other options are as per the defaults.
                
                What happens next is determined by the options object which is either passed in the to callback,
                or returned by the handler function. The possible options are:
                *
                    keepListening: whether to listen for follow-on utterances - default: true
                    say: a string to say to the user (before listening) - default: ''
                        If a "do" function is returned this indicates that the capability supports delayed start.
                        If so the the say value can be an array of two values - the first in the present tense and the second in the future tense
                           the future tense version will only be used if a delay was specified in which case it will be preface by...
                           "In xxx seconds time I will..."
                    play: a sound to play - this is played before saying anything set in the "set" parameter
                    cachable: whether the thing to be said should be cached or not - default: true
                    do: a function to call that actually does the action the user has requested
                        This will be called either straight away, or later on if the user has delayed the action
                        e.g. by saying "in five minutes time ...."
                        If "do" is set but === false, this indicates that there was an error and the delayed action should be aborted
                        If "do" is === true, this indicates that there is no specific do handler - just that the utterance should be replayed
                           at the specified time
                    undo: a function to call that undoes the action - this is only used if the user says
                        e.g. "do <thing> for 10 minutes" - the undo funtion will be called 10 minutes after the do function
                    newContext: the new context to use when interpreting future utterances
                    contextHandlesStop: set this to true if the newContext wants to handle stop words and no response from the user (timeout)
                        normally these would just cause the assistant to give up, but sometimes you want to talk to the user
                        or dosomething after this happens.
            */
            let safetyTimeout = false;
            
            let processHandlerResult = function(options) {
                // If the response is just a string then use this as the "say" option and defaults for everything else
                if (typeof(options)=='string') options = { say: options };
                
                if (options.contextHandlesStop) self.contextHandlesStop=true;
                
                if (safetyTimeout) clearTimeout(safetyTimeout);
                safetyTimeout=0;

                if (typeof(options.newContext)=='string' && options.newContext.length) self.currentContext = options.newContext;
                else self.currentContext = '';
             
                if (validContexts[i]=='main') self.delayStart = result.textMatchData.hasOwnProperty('delayStartDuration') ? parseInt(result.textMatchData.delayStartDuration) : 0;
                
                // delayed start is only supported if "do" is returned
                if (options.hasOwnProperty('do')) {
                    if (!self.delayStart && typeof(options.do)=='function') options.do();
                    else if (self.delayStart && options.do!==false) {
                        
                        console.log('Delaying action for '+self.delayStart+' seconds');
                        if (typeof(options.do)=='function') setTimeout( options.do, self.delayStart*1000 );
                        else if (options.do===true) {
                            // If there is no specific "do" function then just replay the utterance later
                            setTimeout( function(){
                                self.manager.enqueueTask( 'assistant', 'assistant', 'ignore delay '+utterance );
                            }, self.delayStart*1000 );
                        }
                        
                        // See if the handler returned a future tense version of the spoken response
                        if (Array.isArray(options.say) && options.say.length>1) options.say='OK. In '+self.describeDuration(self.delayStart,true)+' time I will '+options.say[1];
                        else options.say='OK. I\'ll do that in '+self.describeDuration(self.delayStart,true)+' time';
                    }
                    if (Array.isArray(options.say)) options.say=options.say[0];
                }
                
                if (typeof(options.undo)=='function' && result.textMatchData.hasOwnProperty('actionDuration')) {
                    setTimeout( options.undo, (self.delayStart + result.textMatchData.actionDuration) * 1000 );
                }
                
                let finishOff = function(){
                    if (options.keepListening===false) {
                        console.log('handler told us to stop listening');
                        self.done();
                    } else {
                        // Decided not to keep listening
                        // self.listen();
                        self.done();
                    }
                };
                
                if (typeof(options.play)=='string' && options.play.length) {
                    self.manager.play(options.play,function(){
                        if (typeof(options.say)=='string' && options.say.length) {
                            self.manager.say(options.say,options.cachable!==false,finishOff);
                        } else finishOff();
                    })
                } else {
                    if (typeof(options.say)=='string' && options.say.length) {
                        self.manager.say(options.say,options.cachable!==false,finishOff);
                    } else finishOff();
                }
            };

            // run any automaticMatchProcessors
            for (let suffix in automaticMatchProcessors) {
                for (let key in result.textMatchData) {
                    let index = key.indexOf(suffix);
                    if (index>=0 && index==key.length-suffix.length) {
                        result.textMatchData[key] = automaticMatchProcessors[suffix](result.textMatchData[key]);
                    }
                }
            }
            
            let handlerResult = result.handler( result.textMatchData, this, processHandlerResult );
            if (typeof(handlerResult)=='object' || typeof(handlerResult)=='string') processHandlerResult(handlerResult);
            else {
                // if the handler doesn't return an object or a string that means it wants to call the callback we passed it instead
                // but set a timeout just in case they don't
                
                // HOWEVER if the handler has already synchronously called the processHandler calback then there is no need to set a safety timeout
                // We know if this is the case by checking if safetyTimeout===0;
                if (safetyTimeout!==0) {
                    safetyTimeout = setTimeout(function(){
                        console.log('Handler didn\'t respond in time - running safety handler');
                        processHandlerResult({
                            say: 'Hmm... looks like something went wrong. Sorry!'
                        });
                    },15000);
                }
            }
            
            return true;
        }
    }

	// Didn't recognize the utterance - or no handler defined
    this.manager.say('Sorry. I don\'t understand.',true,function(){ self.done(); });
    // In this case record the false positive if a handler was passed for doing this
    if (typeof(this.triggerData)=='object' && this.triggerData.hasOwnProperty('wakeWordFalsePositiveRecordCallback')) this.triggerData.wakeWordFalsePositiveRecordCallback();
    return false;    
}

// ==========================================================================================
// Utility functions used by various capabilities
// ==========================================================================================

let durationParts = {
    week   : 86400*7,
    day    : 86400,
    hour   : 3600,
    minute : 60,
    second : 1
}
Assistant.prototype.describeDuration = function( s, alwaysEndInS=false ) {
    let parts=[];
    for( let part in durationParts ) {
        let p = Math.floor(s/durationParts[part]);
        if (p>0) {
            parts.push( p+' '+part+(p>1?'s':'') );
            s = s % durationParts[part];
            if (s==0) break;
        }
    }
    
    let durationWords = this.englishJoin(parts)
    if (alwaysEndInS===-1) durationWords = durationWords.replace(/(day|minute|hour|second)s/g,'$1');
    if (alwaysEndInS===true) durationWords = durationWords.replace(/(day|minute|hour|second)$/g,'$1s');
    return durationWords;
}

Assistant.prototype.describeTime = function( time ) {
    let [hours,mins] = new Date(time).toLocaleTimeString().split(':');
    hours = parseInt(hours);
    mins = parseInt(mins);
    
    let hoursDescription = (hours % 12);
    let ampm = (hours>11?'pm':'am');
    let extra='';
    
    if (time > Math.ceil(new Date()/86400000)*86400000) extra=' tomorrow';
    
    if (mins==0) {
        if (hours==0) return 'midnight';
        if (hours==12) return 'midday'+extra;
        return (hours % 12)+ampm+extra;
    } else if (mins==15) {
        if (hours==0) return 'quarter past midnight';
        return 'quarter past '+hoursDescription+ampm+extra;
    } else if (mins==30) {
        if (hours==0) return 'half past midnight';
        return 'half past '+hoursDescription+ampm+extra;
    } else if (mins==45 || mins==40 || mins==50 || mins==55) {
        hours = (hours+1) % 12;
        ampm = hours>11?'pm':'am';
        if (hours==0) return 'quarter to midnight';
        if (mins=45) return 'quarter to '+hours+ampm+extra;
        return (60-mins)+' to '+hours+ampm+extra;
    } else if (hours=0) {
        return mins+' minutes past midnight';
    }
    
    return hoursDescription+':'+mins+ampm+extra;
}

Assistant.prototype.englishJoin = function( list, separator=',' ) {
    if (!list.length) return '';
    if (list.length==1) return list[0];
    let result = (separator==';'?';':'') + ' and '+list.pop();
    return list.join(separator+' ') + result;
}


// See https://stackoverflow.com/questions/4558437/programmatically-determine-whether-to-describe-an-object-with-a-or-an
Assistant.prototype.indefiniteArticle = function(phrase) {

    // Getting the first word 
    let word = phrase.match(/^\w+/)
    if (word) word = word[0].toLowerCase();
    else return '';

    // Numbers
    if (word.match(/^(8|11|18|8\d+)$/)) return 'an ';
    if (word.match(/^\d/)) return 'a ';
    
    // Specific start of words that should be preceeded by 'an '
    var alt_cases = ["honest", "hour", "hono"];
    for (var i in alt_cases) {
        if (word.indexOf(alt_cases[i]) == 0) return "an ";
    }

    // Single letter word which should be preceeded by 'an'
    if (word.length == 1) {
        if ("aedhilmnorsx".indexOf(l_word) >= 0) return "an ";
        else return "a ";
    }

    // Special cases where a word that begins with a vowel should be preceeded by 'a'
    regexes = [/^e[uw]/, /^onc?e\b/, /^uni([^nmd]|mo)/, /^u[bcfhjkqrst][aeiou]/]
    for (var i in regexes) {
        if (word.match(regexes[i])) return "a "
    }

    // Special capital words (UK, UN)
    if (word.match(/^u[nk]/)) return "a ";

    // Basic method of words that begin with a vowel being preceeded by 'an'
    if ("aeiou".indexOf(word) >= 0) return "an ";

    return "a ";
}

Assistant.prototype.convertNumber = convertNumber;

module.exports = Assistant;
