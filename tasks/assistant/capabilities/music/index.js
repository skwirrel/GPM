function playMusic( matchDetails, manager, callback ) {
    let type = Object.keys(matchDetails)[0];
    let name = matchDetails[type];
    console.log('Playing '+type+':'+name);
    manager.say('Playing '+type+':'+name,true,callback);
}

let capabilities = [
    {
        context         : 'main',
        incantations    : [
            '$please $canYou play [me] [[[a] track[s]|[some] music|something] by|some] (artist:<stuff>) $please',
            '$please $canYou play [me] the album (album:<stuff>) $please]',
            '$please $canYou play [me] [the [track|song]] (song:<stuff>) $please',
            '$please $canYou play [me] (something:<stuff>) $please',
        ],
        handler         : playMusic
    }
        
];

module.exports = {
    capabilities: capabilities
}
