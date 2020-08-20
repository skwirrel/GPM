const { spawn } = require('child_process');

const Pattern = require('./Pattern.js');

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

<matchFunction>
The function is called repeatedly with different bits of text to see if the start of the text matches anything it knows about.
The function should return false if it doesn't recognise anything at the start of the text.
If it DOES recognise the start of the text then it should return an array of the possible matches.
Each match in the return array should either be whatever is left of the string that was past in after removing the matching bit, or an array consisting of this whatever is left of the string that was past in after removing the matching bit followed by the substitute text to be used for the match

The following built in match functions are defined
  <time>
  <date>
  <number>
  <theRest>
*/

const phrasebook = {
    please          : '[(polite:[please:please])]',
    canYou          : '[[can|could|will] you]',
}

const commands = [
    [ 'whatTimeIsIt'  , '$please $canYou [tell me] what[s] [time [it is|is it]|[is ]the time] [now] $please'],
    [ 'todaysDate'    , '$please $canYou [tell me] what[s| is] [todays|the] date [today] $please'],
    [ 'playMusic'     , '$please $canYou play [me] [[[a] track[s]|[some] music|something] by|some] (artist:<theRest>)'],
    [ 'playMusic'     , '$please $canYou play [me] the album (album:<theRest>)'],
    [ 'playMusic'     , '$please $canYou play [me] [the [track|song]] (song:<theRest>)'],
    [ 'playMusic'     , '$please $canYou play [me] (something:<theRest>)'],
];

const commandHandlers = {
	'todaysDate' : function( matchDetails, manager, callback ) {
		const d = new Date();
		const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(d);
		const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d);
		const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(d);
		var day = new Intl.DateTimeFormat('en', { day: 'numeric' }).format(d);
		// Add the ordinal
		day += (day > 0 ? ['th', 'st', 'nd', 'rd'][(day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10] : '');

		manager.say('Today is '+weekday+' the '+day+' of '+month+' '+year,true,callback);		
	},
	'whatTimeIsIt' : function( matchDetails, manager, callback ) {
		const date = new Date();
		var hours = date.getHours();
		var minutes = date.getMinutes();
		var ampm = hours >= 12 ? 'pm' : 'am';
		hours = hours % 12;
		hours = hours ? hours : 12; // the hour '0' should be '12'
		
		manager.say('The time is '+hours+' '+minutes+' '+ampm,true,callback);		
	},
	'playMusic' : function( matchDetails, manager, callback ) {
		let type = Object.keys(matchDetails)[0];
		let name = matchDetails[type];
		console.log('Playing '+type+':'+name);
		manager.say('Playing '+type+':'+name,true,callback);
	},
};

const multiPattern = new Pattern.MultiPattern({
    commands:           commands,
    phrasebook:         phrasebook,
    matchFunctions:     matchFunctions,
    processFunctions:   processFunctions,
});


function Assistant( manager ) {
    this.manager = manager;
    this.listening = false;
    this.hearBuffer = '';
    this.listener = spawn('python3',['tasks/listener.py']);
    this.listener.stdin.setEncoding('utf-8');
    
    var self = this;
    this.listener.stdout.on('data',function(data) {
        self.hearBuffer += data.toString();
        crPos = self.hearBuffer.indexOf("\n");
        
        if (self.listening && crPos) {
            let heard = self.hearBuffer.substr( 0, crPos );
            self.hearBuffer = self.hearBuffer.substr( crPos+1 );
            self.heard( heard.trim().toLowerCase() );
        }
    });
    this.listener.stderr.on('data',function(data) {
        // console.log('Listener error:'+data);
    });
}

Assistant.prototype.run = function( parameters ) {
    console.log('Running Assistant ')

    
    spawn('/usr/bin/play', ['bleep.mp3']);
    this.listen();
}

Assistant.prototype.listen = function( ) {
    this.listening = true;
    let result = this.listener.stdin.write("listen\n");
    if (!result) console.log('Problem listening');
    else console.log('Assistant is listening');
}

Assistant.prototype.done = function() {
    spawn('/usr/bin/play', ['bloop.mp3']);
    // Wait for bloop to finish playing until we finally relinquish control
    var self = this;

    setTimeout( function(){
		console.log('Assistant finished');
        self.manager.done();
    }, 500);
}

const stopWords = [ 'ok','nothing','forget it','thats all','thanks' ]
Assistant.prototype.heard = function( utterance ) {
    var self = this;
    this.listening = false;
    console.log('Assistant heard: ',utterance);
    
    // Remove punctuation etc
    utterance = utterance.replace(/[^a-z0-9 ]+/g,'');

    // If they didn't say anything - or they said a stop work then stop listening
    if (!utterance.length || stopWords.includes( utterance )) {
        console.log('finishing');
		this.done();
		return false;
	}


    // This is where the magic happens!
    
    let result = multiPattern.match( utterance );
    
    //console.log(result);
    // Handle recognized stuff first
    if ( typeof( commandHandlers[result.matchedCommand] ) == 'function' ) {
		// Call the handler passing the callback for them to call when they are finished
		commandHandlers[result.matchedCommand]( result.textMatchData, this.manager, function() {
			self.listen();
		});
		return true;
	}
    
	// Didn't recognize the utterance - or no handler defined
    this.manager.say('Sorry. I don\'t understand.',true,function(){ self.listen(); });
    return false;    
}

module.exports = Assistant;
