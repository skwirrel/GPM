var Pattern = require('./Pattern.js');

var matchFunctions = {
};

var processFunctions = {
	'uppercase': function(str) { return str.toUpperCase(); },
};

/*
[pattern]
If only one pattern is included then this pattern is optional
If more than one pattern is included separated by pipe's (|) then one of the patterns must macth - one of the patterns can be the empty string to make the whole thing options - but this must be either the first of the last sub-match e.g. [|option 1|option 2] or [option 1|option 2|], but not [option 1||option 2]

[replacement:pattern]
If the square bracket starts with replacement text followed by a colon, then if the brackets match then the matching text is replaced by the replacement text

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

var phrasebook = {
	please          : '[(polite:[please:please])]',
	canYou          : '[[can|could|will] you]',
}

const commands = [
    [ 'whatTimeIsIt'  , '[$please $canYou [tell me] what time [it is|is it]|what[s| is] the time] [now] $please'],
    [ 'playMusic1'     , '$please $canYou play [me] [[[a] track[s]|[some] music|something] by|some] (artist:<theRest>)'],
    [ 'playMusic2'     , '$please $canYou play [the] album (album:<theRest>)'],
    [ 'playMusic4'     , '$please $canYou play [me] (something:<theRest>)'],
    [ 'playMusic3'     , '$please $canYou play [the [track|song]] (song:<theRest>)'],
];


tests = [
	'what time is it',
	'whats the time',
	'what time is it now',
	'what is the time now',
	'please tell me what time it is',
	'what time is it',
	'what is the time',
	'Play me something by del amitri',
	'Play me music by del amitri',
	'Play me some del amitri',
	'Play del amitri',
	'Play me del amitri',
]
// tests = ['the quick brown fox jumped over the lazy dog']

let multiPattern = new Pattern.MultiPattern({
	commands:           commands,
	phrasebook:	        phrasebook,
	matchFunctions:     matchFunctions,
	processFunctions:   processFunctions,
});

const util = require('util');
for( i=0; i<tests.length; i++ ) {
	console.log(util.inspect(multiPattern.match(tests[i], false, null, true)));
}
