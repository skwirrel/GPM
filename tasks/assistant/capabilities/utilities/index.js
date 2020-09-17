let capabilities = [
    {
        context         : 'main',
        incantation     : 'how [are] you [feeling] [today|now|at the moment|]',
        handler         : function( matchDetails, assistant, callback ) {
            return {
                say: "I'm fine. Thanks for asking!",
                cachable: true
            };
        },
    },{
        context         : 'main',
        incantation     : '[tell me] how [does one|should I|[do] you|to] spell (word:<stuff>)',
        handler         : function( matchDetails, assistant, callback ) {
            word = matchDetails.word;
            return {
                say: '"'+word+'" is spelled: '+word.replace(/(.)/g,'$1,'),
                cachable: false
            };
        },
    }
];

module.exports = {
    capabilities: capabilities
}
