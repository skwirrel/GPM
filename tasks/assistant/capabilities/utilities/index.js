let capabilities = [
    {
        context         : 'main',
        incantation     : 'how [are] you [feeling] [today|now|at the moment|]',
        handler         : function( matchDetails, manager, callback ) {
            manager.say("I'm fine. Thanks for asking!",true,callback);
        },
    },{
        context         : 'main',
        incantation     : '$please $canYou [tell me] how [does one|should I|[do] you|to] spell (word:<stuff>) $please',
        handler         : function( matchDetails, manager, callback ) {
            word = matchDetails.word;
            manager.say('"'+word+'" is spelled: '+word.replace(/(.)/g,'$1,'),false,callback);
        },
    }
];

module.exports = {
    capabilities: capabilities
}
