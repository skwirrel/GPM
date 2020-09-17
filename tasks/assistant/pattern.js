// ==================================================================================
// Pattern Object
// ==================================================================================

const builtIn = {
	textMatch : {
		theRest : function(input) {
			return(['']);
		},
		stuff : function(input,variant='words') {
            let results=[];
            do {
                input = input.replace(variant=='words' ? /^\S+\s*/ : /^./,'');
                results.push(input);
            } while(input.length);
            return results;
		},
		number : function(input,min=null,max=null) {
            input = input.replace(/^(\.\d+)/,'0$1');
            let matched;
            if (matched = input.match(/^-?\d+(\.\d+)?/)) {
                let value = matched[1] ? parseFloat(matched[0]) :  parseInt(matched[0]);
                if ((min!==null && min.length && value<parseFloat(min)) || (max!==null && max.length && value>parseFloat(max))) return[];
                else return[input.substring(matched[0].length)];
            }
            return [];
		}
	}
};

const handlers = {
	'['	: {
		regexp	: /^(.*?)([\$\{<\(\[\]])/,
		closer	: ']',
		processText	: function( substr, position ) {
		
			// See if there is a substitution defined at the start
			let substituteText = null;
			if (position=='start') {
				let matches = substr.match(/^([0-9a-zA-Z_-]*)\s*:\s*/);
				if ( matches ) {
					substituteText = matches[1];
					substr = substr.substring(matches[0].length);
				}
				if ( substr=='' ) return [substituteText];
			} else if ( substr=='' ) return [];

			if (substr=='|') {
				if (position=='middle') return ['|'];
				if (position=='start') return [substituteText,'','|'];
				if (position=='end') return ['|','']
			}
			
			let toReturn = substr.split('|');
			
			for ( let i=1; i<toReturn.length; i+=2 ) {
				toReturn.splice(i,0,'|');
			}
			// Only allow empty strings at the start or the end of the option list
			if (position=='middle') toReturn=toReturn.filter(function(x){ return x !== '' });

			// store the substitute text (if any) at the start of the array
			if (position=='start') {
				toReturn.unshift(substituteText);
			}
			
			return toReturn;
		},
		processResult : function( input ) {
			input.push('|');
			// Pull the bracket type and the substitute text off the front of the array and put them straight onto the result array
			let result = [ input.shift(), input.shift() ];
			let accumulator = [];
			for ( let i=0; i<input.length; i++ ) {
				if (input[i]=='|') {
					if (accumulator.length) {
						if (accumulator.length==1) result.push(accumulator[0]);
						else {
							accumulator.splice(0,0,'(','');
							result.push(accumulator);
						}
					}
					accumulator = [];
				} else {
					accumulator.push(input[i]);
				}
			}
			
			// if there is only one item in the brackets and no substitute text (e.g. [thing]) then add an implied empty option (i.e. [|thing])
			if (result.length==3 && result[2]!='' && result[1]==null) result.splice(2,0,'');
			return result;
		}
	},

	'('	: {
		regexp	: /^(.*?)([\$\{<\(\[\)])/,
		closer	: ')',
		processText	: function( substr, position ) {
			let result = [];
			
			if (position=='start') {
				let bits = substr.match(/^([0-9a-zA-Z_-]+)\s*:\s*(.*)/);
				if (!bits) result.push('');
				else {
					result.push(bits[1]);
					substr=bits[2];
				}
			}

			if (substr.length) result.push(substr)
			
			return result;
		}
	},

	'<'	: {
		regexp	: /^(.*?)(>)/,
		closer	: '>',
		processText	: function( substr ) { return substr.split(':') }
	},
	
	'{'	: {
		regexp	: /^(.*?)([\$\{<\(\[\}])/,
		closer	: '}',
	},

	'$'	: {
		regexp	: /^([a-zA-Z0-9_-]+)/,
		closer	: '',
		processText	: function( substr ) { return [substr] }
	}

}

handlers['{'].processText = handlers['('].processText;

function deepClone(src) {
   var out, value, key;
   out = Array.isArray(src) ? [] : {};
   for (key in src) {
       value = src[key];
       out[key] = (typeof(value) == "object" || typeof(value) == "array") ? deepClone(value) : value;
   }
   return out;
}

function makeSubstituteText( substituteText, matched ) {
	if (matched.substr(0,1)==' ') return ' '+substituteText;
	return substituteText;
}

function matchItem( state, pattern, substituteText, substituteIfEmpty, functions ) {
	let str = state.str;
	if (typeof(pattern)=='string') {
		let before = '';
		let bits = str.match(/^\s+/);
		if (bits) {
			before = bits[0];
			str = str.substring( before.length );
		}
        let patternLength = pattern.length + before.length;
		pattern = pattern.trim();
		if (pattern==='') {
			let newState = deepClone(state);
			if ( substituteIfEmpty && substituteText && substituteText.length ) newState.matchAccumulatorStack[0].push( substituteText );
			return [ newState ];
		}
		if ( str.substring(0,pattern.length).toUpperCase() === pattern.toUpperCase() ) {
			let newState = deepClone(state);
			newState.str = str.substring(pattern.length);
			newState.numMatchedChars += patternLength;
			newState.numMatches++;
			newState.matched += before+pattern;
			newState.matchAccumulatorStack[0].push( substituteText && substituteText.length ? makeSubstituteText(substituteText,before+pattern) : before+pattern );
			return [ newState ];
		}
		return false;
	} else {
		let result = _match( deepClone(state), pattern, functions );
		if (substituteText && substituteText.length) {
			for (let i = 0; i<result.length; i++) {
				let matched = result[i].matchAccumulatorStack[0].join('');
				if (substituteIfEmpty || matched.length) result[i].matchAccumulatorStack.splice(0,1,[makeSubstituteText(substituteText,matched)]);
			}
		}
		return result;
	}
};

function _match( state, pattern, functions ) {
		
	let originalStr = state.str;

	pattern = pattern.slice(0);
	
	let type = pattern.shift();

	state.matchAccumulatorStack.unshift([]);

	let results = [];
	let saveTo = '';
	let postProcessWith = '';
	
	if (type=='[') {
		let substituteText = pattern.shift();
		for (let i=0; i<pattern.length; i++) {
			// if the first sub-pattern is empty string then this means only use the substitute text for non-empty matches
			let substituteIfEmpty = pattern[0]!=='';
			let newResults = matchItem( state, pattern[i], substituteText, substituteIfEmpty, functions );
			if ( newResults !== false ) results.push.apply(results, newResults);
		}
		if ( !results.length ) return false;
	}

	else if (type=='(' || type=='{') {
		if (type=='(') saveTo = pattern.shift();
		else postProcessWith = pattern.shift();
		
		results.push( state );
		for (let i=0; i<pattern.length; i++) {
			let newResults = [];
			for (let j=0; j<results.length; j++) {
				let subResults = matchItem( results[j], pattern[i], '', false, functions );
				if (subResults!==false) newResults.push.apply(newResults, subResults);
			}
			results = newResults;
			if (!results.length) return false;
		}

	}
	
	else if (type=='<') {
		let functionName = pattern.shift();
		if (typeof(functions.textMatch[functionName])=='function' || typeof(builtIn.textMatch[functionName])=='function') {
			let theFunction = functions.textMatch[functionName]=='function' ?
				functions.textMatch[functionName] :
				builtIn.textMatch[functionName]
			;
			let textResults = theFunction(state.str.trim(),...pattern);
			if (!textResults.length) return false;
			for( let i=0; i<textResults.length; i++) {
				let substituteText = ''
				let result = deepClone(state);
				if (Array.isArray(textResults[i])) {
					result.str = textResults[i][0];
					substituteText = textResults[i][1];
				} else {
					result.str = textResults[i];
				}
				let matched = originalStr.substring( 0, originalStr.length - result.str.length );
				result.numMatchedChars += matched.length;
				result.numMatches++;
				result.matched += matched;
				result.matchAccumulatorStack[0].push( substituteText.length ? makeSubstituteText(substituteText,matched) : matched );
				results.push(result);
			}
		} else {
			// the function couldn't be found - just ignore it.
			results.push( state );
		}
	}
	
	else {
		return 'Unrecognized bracket type: '+type;
	}

	for (let i=0; i<results.length; i++) {
		let matched = results[i].matchAccumulatorStack.shift().join('');
		if (postProcessWith.length && typeof(functions.postProcess[postProcessWith])=='function') {
			matched = functions.postProcess[postProcessWith](matched);
		}
		if (saveTo.length) {
			results[i].textMatchData[saveTo] = matched.trim();
		}
		results[i].matchAccumulatorStack[0].push(matched);
	}
	
	return results;
}

function _parse(str,bracketType) {

	// Store the bracket type as the first parameter of the array
	let result = [bracketType];
	
	let position = 'start';
	
	while (true) {
		let originalString = str.value;
		let matches = str.value.match(handlers[bracketType].regexp);
		if (!matches) return 'Unexpected text: '+str.value;
		
		str.value = str.value.substring(matches[0].length);
				
		let subtext = matches[1].trim();
		let foundCloser = handlers[bracketType].closer=='' || matches[2]==handlers[bracketType].closer;
		
		// as far as position goes: start trumps end
		// i.e. if this is both the start and the end then say it is the start, not the end
		if (position=='middle' && foundCloser) position = 'end';
		
		let toAdd = handlers[bracketType].processText(subtext,position);
		// Propagate errors back up
		if (typeof(toAdd)=='string') return toAdd;
		if (toAdd.length) result.push.apply(result, toAdd);
		
		if (foundCloser) {
			if (handlers[bracketType].processResult) return handlers[bracketType].processResult(result);
			else return result;
		}
		
		if (matches[2]) {
			let subset = _parse(str, matches[2]);
			// Propagate errors back up
			if (typeof(subset)=='string') return subset;
			result.push(subset);
		}
		
		if (!str.value.length) return 'Unexpected end of parse string after: '+originalString;

		position = 'middle';
	}
}

function _replacePhrases( pattern, phrasebook ) {
	
	for (let i=2; i<pattern.length; i++) {
		if (typeof(pattern[i])=='string') continue;
		if (pattern[i][0]=='<') continue;
		if (pattern[i][0]=='$') {
			phrase = pattern[i][1];
			if (!phrasebook[phrase]) return 'Undefined phrase encountered: '+phrase;
			pattern[i] = phrasebook[phrase];
			// Go back over this one to make sure this phrase doesn't include any phrases
			i--;
			continue;
		}
		let result = _replacePhrases( pattern[i], phrasebook );
		// propagate any errors back up
		if (result!==true) return result;
		
	}
	return true;
}

const Pattern = function(input) {
    this.textMatchFunctions = {};
    this.processFunctions = {};
    this.phrasebook = {};
    this.lastError = null;
    
    if (typeof(input) == 'string') this.setPattern(input);
    else {
        let standardInputs = {
            phrasebook		: 'parsePhrasebook',
            phrasebookFile	: 'loadPhrasebook',
            pattern			: 'setPattern'
        }
        for( let thing in standardInputs ) {
            if (input[thing]) {
                let okOrError = this[standardInputs[thing]](input[thing]);
                this.lastError = okOrError;
                if ( okOrError !== true ) console.log(okOrError);
            }
        }

        if (input.matchFunctions && typeof(input.matchFunctions)=='object') this.textMatchFunctions = input.matchFunctions;
        if (input.processFunctions && typeof(input.processFunctions)=='object') this.processFunctions = input.processFunctions;
    }
}

Pattern.prototype.setPhrasebook = function(phrasebook) {
    for (let phraseName in phrasebook) {
        if ( typeof(phrasebook[phraseName]) == 'string' ) {
            let pattern = _parse( { value : phrasebook[phraseName]+')'} , '(' );
            if (typeof(pattern)=='string') return pattern;
            else phrasebook[phraseName] = pattern;
        }
    }
    return true;
}
	
Pattern.prototype.parsePhrasebook = function(phrasebook) {
    var result = true;
    if (typeof(phrasebook)=='string') {
    let lines = phrasebook.split(/[\r\n]+/);
        while (lines.length) {
            let line = lines.shift();
            if (line==='') continue;
            let matches = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
            if (matches) {
                let pattern = _parse( { value : matches[2]+')'} , '(' );
                if (typeof(pattern)=='string') return pattern;
                else this.phrasebook[matches[1]]=pattern;
            } else if (line.match(/^\s*#/)) {
                // ignore this line - do nothing
            } else {
                result = 'Invalid line in phrasebook: '+line;
            }
        };
    } else {
        for (let name in phrasebook) {
            let pattern = _parse( { value : phrasebook[name]+')'} , '(' );
            if (typeof(pattern)=='string') return pattern;
            else this.phrasebook[name]=pattern;
        }
    }
    return result;
}

Pattern.prototype.setPattern = function(pattern) {
    var pattern = _parse( { value : '_matched:'+pattern+')'} , '(' );
    let okOrError = _replacePhrases( pattern, this.phrasebook );
    if (okOrError!==true) return okOrError;
    //_resolveEmptySubstitueText( pattern );
    this.pattern = pattern;
    return true;
}
	
Pattern.prototype.addMatchFunction = function( name, func ) {
    this.textMatchFunctions[name] = func;
}

Pattern.prototype.addPostProcessFunction = function( name, func ) {
    this.processFunctions[name] = func;
}

Pattern.prototype.match = function( testText ) {
    if (!this.pattern) return 'Pattern not set';
    let state = {
        str				: testText,
        numMatchedChars	: 0,
        numMatches		: 0,
        matched			: '',
        textMatchData	: {},
        matchAccumulatorStack		: [ [] ],
    };
    let matches = _match( state, this.pattern, { textMatch: this.textMatchFunctions, postProcess: this.processFunctions } );
    let fullMatches = [];
    let partialMatches = [];
    for (let i=0;i<matches.length; i++) {
        let whichResultSet = matches[i].str=='' ? fullMatches : partialMatches;
        // Reorder the match lists such that the longer matches come top
        // If there is a draw on match length then look at the number of matches - more matches wins
        for (let j=0;j<=whichResultSet.length; j++) {
            if (
                j==whichResultSet.length ||
                whichResultSet[j].str.length<matches[i].str.length ||
                (whichResultSet[j].str.length==matches[i].str.length && whichResultSet[j].numMatches<matches[i].numMatches)
            ) {
                whichResultSet.splice(j,0,matches[i]);
                break;
            }
        }
    }
    if (!fullMatches.length) fullMatches=false;
    return [fullMatches,partialMatches];
}

const MultiPattern = function( options ) {
    let commands = options.commands;
    this.commands = [];
    
    let command,i;
    for( i=0; i<commands.length; i++ ) {
        this.commands[i] = [
            new Pattern({
                pattern:            commands[i][0],
                phrasebook:         options.phrasebook,
                matchFunctions:     options.matchFunctions,
                processFunctions:   options.processFunctions,
            }),
            commands[i][1]
        ];
    }
}
	
MultiPattern.prototype.match = function( input ) {
    let command,i;
    for( i=0; i<this.commands.length; i++ ) {
        result = this.commands[i][0].match(input);
        if (result[0]) {
            result[0][0].handler=this.commands[i][1];
            return(result[0][0]);
        }
    }
    return false;
}

module.exports = { Pattern: Pattern, MultiPattern: MultiPattern }
