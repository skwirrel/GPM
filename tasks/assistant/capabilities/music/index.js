const { spawn } = require('child_process');

console.log('Starting playlist maker');

var playlistMaker = spawn('node',[__dirname+'/playlistMaker.js']);

var buffer;
var onOutput = false;

playlistMaker.stdout.on('data',function(data){
	console.log('Output from playlist maker: '+data.toString().trim());

    buffer += data.toString();
    
    let endPos = buffer.indexOf("\nEND\n");
    if (endPos) {
        if (onOutput) onOutput(buffer.substr( 0, endPos ));
        buffer = buffer.substr( endPos+5 );
    }
    
})

playlistMaker.stderr.on('data',function(data){
    console.log('playlistMaker.js generated error: '+data.toString());
});

function playMusic( matchDetails, manager, callback ) {
    let type = Object.keys(matchDetails)[0];
    let name = matchDetails[type];
    lastOutput='';
    playlistMaker.stdin.write(type+':'+name);
    onOutput = 
    console.log('Playing '+type+':'+name);
    manager.say('Playing '+type+':'+name,true,callback);
}

let capabilities = [
    {
        context         : 'main',
        incantations    : [
            'play [me] (anything:[[|some|any] music|anything])',
            'play [me] [[[a] track[s]|[some] music|something] by [the [artist|band|musician|composer]]|some] (artist:<stuff>)',
            'play [me] the album (album:<stuff>)]',
            'play [me] [the [track|song]] (song:<stuff>)',
            'play [me] (something:<stuff>)',
        ],
        handler         : playMusic
    }
        
];

module.exports = {
    capabilities: capabilities
}
