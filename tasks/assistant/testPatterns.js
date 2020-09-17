var Pattern = require('./pattern.js');

var matchFunctions = {
};

var processFunctions = {
	'uppercase': function(str) { return str.toUpperCase(); }
};

var phrasebook = {
    oneTo19     : '[a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen]',
    oneTo99     : '[$oneTo19|[twenty|thirty|fourty|fifty|sixty|seventy|eighty|ninety] [|one|two|three|four|five|six|seven|eight|nine]]',
    oneTo999    : '[$oneTo99|$oneTo19 hundred [[and] $oneTo99]|$oneTo99 $oneTo99]',
    oneTo999999 : '[$oneTo999|$oneTo999 thousand [[and] $oneTo999]]',
    oneTo999999999 : '[$oneTo999999|(millions:$oneTo999) million [[and] $oneTo999999]]',
    secondsDuration : '$oneTo999999 second[s]',
    minutesDuration : '[$secondsDuration|$oneTo999 minute[s] [[and] $secondsDuration]]',
    hoursDuration : '[$minutesDuration|$oneTo99 hour[s] [[and] $minutesDuration]]',
    daysDuration : '[$minutesDuration|$oneTo999 day[s] [[and] $hoursDuration]]',
};

function exhaustiveReplace( str, regex, replacement ) {
    let newStr=str;
    do {
        str=newStr
        newStr = str.replace(regex,replacement);
    } while ( newStr !== str );
    return newStr;
}

const numberLookup = {
    a:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,fourty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,million:1000000
}

function convertNumber(str) {
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
function convertDuration(result) {
    result = convertNumber(result);
    var total=0;
    result.replace(/\b(\d+)\s+(second|hour|minute|day)s?\b/g,function(match,p1,p2){ total+=durationLookup.hasOwnProperty(p2)?parseInt(p1)*durationLookup[p2]:0 } );
    return total;
}

const commands = [
    ["(number:$oneTo999999999)"],
    ["(duration:$daysDuration)"],
    ["(gt100number:<number:100>)"],
    ["(lt100number:<number::100>)"],
    ["(anynumber:<number>)"]
];


numberTests = [
    'nine hundred million and twenty one',900000021,
	'one',1,
    'two',2,
    'ninety',90,
    'ninety nine',99,
    'one hundred',100,
    'eighteen hundred',1800,
    'eighteen hundred and ninety nine',1899,
    'eighteen ninety nine',1899,
    'twenty twenty one',2021,
    'one hundred and ninety nine',199,
    'five hundred and ninety nine',599,
    'one thousand',1000,
    'one thousand and ninety nine',1099,
    'a thousand and one',1001,
    'one thousand six hundred and one',1601,
    'five hundred and twelve thousand three hundred and sixty one',512361,
    'five hundred and twelve thousand and one',512001,
    'two hundred and five million six hundred and fifty five thousand nine hundred and one',205655901,
    'two hundred and twenty five million six hundred and fifty five thousand',225655000,
    'two hundred and twenty five million six hundred and fifty five thousand and one',225655001,
];
// tests = ['the quick brown fox jumped over the lazy dog']

digitTests = [
    '-0.005','10019','20','.123','199.123'
];

durationTests = [
    'five seconds', 5,
    'five minutes', 5*60,
    'sixty six minutes and thirty seconds', 66*60+30,
    'three days and three minutes', 86400*3+60*3,
    'three days twenty two hours twenty three minutes and fifty five seconds', 86400*3+22*3600+60*23+55,
];

let multiPattern = new Pattern.MultiPattern({
	commands:           commands,
	phrasebook:	        phrasebook,
	matchFunctions:     matchFunctions,
	processFunctions:   processFunctions,
});

while(numberTests.length){
    let utterance = numberTests.shift();
    let desiredOutput = numberTests.shift();
    let result = multiPattern.match(utterance, false, null, true);
    console.log('Testing: '+utterance);
    let number = convertNumber(result.matched);
	if (number!=desiredOutput) {
        console.log('translation failed for: '+utterance);
        console.log('Expected: '+desiredOutput+'\nBut got: '+number);
    }
}

while(durationTests.length){
    let utterance = durationTests.shift();
    let desiredOutput = durationTests.shift();
    let result = multiPattern.match(utterance, false, null, true);
    console.log('Testing: '+utterance);
    let number = convertDuration(result.matched);
	if (number!=desiredOutput) {
        console.log('translation failed for: '+utterance);
        console.log('Expected: '+desiredOutput+'\nBut got: '+number);
    }
}

while(digitTests.length){
    let utterance = digitTests.shift();
    let result = multiPattern.match(utterance, false, null, true);
    console.log('Testing: '+utterance);
    console.log(result.textMatchData);
}
