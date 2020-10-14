const pluralize = require('pluralize');
const stemmer = require('lancaster-stemmer');

const stopWords = 'all in on an the at of a thing things';

const synonyms = `
    light => lamp bulb lantern "light bulb" torch
    cooker => range oven stove microwave
    heater => heating
    air conditioner => "air cooler" "air con"
    hifi => amplifier amp "record player"
    mixer => blender "food processor" "liquidiser"
    bread maker => "bread machine"
    barbeque => bbq
    hood => "extractor fan"
    washer => washing machine
    television => TV
    monitor => screen
    kettle => urn
    slow cooker => "crock pot"
    curler => "curling tongs" "curling iron"
    straightener => "straightening iron" "straighteners"
    shaver => razor
    heating => furnace heating boiler
    hob => "hot plate"
    fridge => refrigerator
    router => modem "base station" "wifi"
    phone => telephone
`;

const stopWordRegexp = new RegExp('\\b('+stopWords.split(/s+/).join('|')+')\\b','gi');
const sanitizeRegexp = new RegExp(/[^a-z0-9 ]/,'g');

// The synonym map is an array, not an object so that the order of the synonym replacement can be preserved
const synonymMap = [];
synonyms.split('\n').forEach(function(line) {
    let[ replace, synonymLine ] = line.split('=>',2);
    if ( !replace.length || !synonymLine ) return;
    replace = replace.trim().toLowerCase();
    let synonyms = [];
    synonymLine = synonymLine.replace(/"(.*?)"/,function(match,p1){
        synonyms.push(p1.trim().toLowerCase());
        return '';
    });
    synonyms.push(...synonymLine.trim().toLowerCase().split(/\s+/).map( synonym => synonym.trim().replace(sanitizeRegexp,'') ).filter(synonym=>synonym.length));
    synonyms.push(...synonyms.map( synonym => pluralize(synonym) ) );
    synonymMap.push([ new RegExp('\\b('+synonyms.join('|')+')\\b','g'), replace ]);
});

function normalizeWords( phrase ) {
    phrase = phrase.toLowerCase();
    for( let [search,replace] of synonymMap ) {
        phrase = phrase.replace(search,replace);
    }

    // Remove stop words
    phrase = phrase.replace(stopWordRegexp,'');
    
    // Split the phrase into words and run them through the stemmer
    let words = phrase.trim().split(/\s+/).map(stemmer);

    return words;
}

function* permute(permutation, iteration) {
    if (!iteration) iteration=0;
    let length = permutation.length;
    yield permutation;
    if (length==1) return;
    for( let i=iteration; i<length; i++ ) {
        let subset = permutation.slice(0);
        subset.splice(i,1)
        yield* permute( subset, i );
    }
}

function sortWords( words ) {
    if (!Array.isArray(words)) words = words.split(/\s+/);
    return words.sort();
}

function deviceFinder() {
    this.devices = {};
    this.originalNames = [];
}

deviceFinder.prototype._register = function( name, device, alreadySeen) {
    if (Array.isArray(name)) name = name.join(' ');
    if (!this.devices.hasOwnProperty(name)) {
        this.devices[name] = [device];
        alreadySeen[name] = true;
    } else if (!alreadySeen.hasOwnProperty(name)) {
        this.devices[name].push(device);
        alreadySeen[name] = true;
    }
}

deviceFinder.prototype._find = function( name ) {
    if (Array.isArray(name)) name = name.join(' ');
    if (!this.devices.hasOwnProperty(name)) return [];
    return this.devices[name];
}

deviceFinder.prototype.register = function( name, device ) {
    this._findOrRegister( name, device )
}

deviceFinder.prototype.listNames = function() {
    return this.originalNames;
}

deviceFinder.prototype.find = function( name ) {
    if (name==='*') {
        const filtered = this.originalNames
            .reduce((obj, key) => {
                return {
                    ...obj,
                    [key]: this.devices[key]
                };
            }, {});
        return filtered;
    }
    return this._findOrRegister( name )
}

deviceFinder.prototype._findOrRegister = function( name, device ) {
    let result;
    let alreadySeen = {};
    let action = typeof(device)=='undefined' ? '_find' : '_register';

    name = name.trim().toLowerCase().replace(sanitizeRegexp,'');

    if (action=='_register' && !this.originalNames.includes(name)) this.originalNames.push(name);

    // Register the device under the following names
    // 1. The original verbatim name (well.... trimmed and sanitized)
    result = this[action]( name, device, alreadySeen );
    if (action=='_find' && result.length) return result;
    
    // 2. The sorted version of the original words
    result = this[action]( sortWords(name), device, alreadySeen );
    if (action=='_find' && result.length) return result;
    
    // 3. The unsorted but normalized words
    result = this[action]( normalizeWords(name), device, alreadySeen );
    if (action=='_find' && result.length) return result;
    
    // 4. The sorted and normalized words (all of them)
    let sortedNormalized = sortWords(normalizeWords(name));
    result = this[action]( sortedNormalized, device, alreadySeen );
    if (action=='_find' && result.length) return result;
    
    // 5. All the permutations of subsets of normalized words (all sorted)
    // At this point we need to deduplicate the array of words
    words = [...new Set(normalizeWords(name))].sort();
    for (var permutation of [... permute(words)].sort(permutation=>permutation.length*-1)) {
        result = this[action](permutation, device, alreadySeen);
        if (action=='_find' && result.length) return result;
    }
    return [];
}

/*
 * Testing code...

devices = new deviceFinder();
for(let device of ['front bedroom left table lamp','front bedroom right table lamp','back bedroom left table lamp','back bedroom right table lamp','kitchen task lighting','kitchen ceiling light','front bedroom ceiling light','back bedroom ceiling light','front bedroom heater','back bedroom heater'] ) {
    devices.register(device,device);
}

for(let device of ['all the lights','the kitchen lights','front lights','back lights','light','bedroom','front bedroom','task lighting','kitchen task lights']) {
    console.log('>>>'+device);
    console.log(devices.find(device));
}

*/

module.exports = deviceFinder;
