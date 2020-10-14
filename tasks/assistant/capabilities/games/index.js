let capabilities = [
    {
        context         : 'main',
        incantation     : '$delayStart [[roll|throw|toss] [me]|romy] (number:[[1:a|one|1]|[2:2|two|a pair of]|[3:3|three]|[4:4|four]]) [dice|die] [for me] $delayStart',
        handler         : function( matchDetails, assistant, callback ) {
            if (matchDetails.delayStartDuration) return {do:true};
            let numDice = parseInt(matchDetails.number);
            assistant.manager.play('sounds/diceRoll.mp3',function(){
                number = Math.floor(Math.random()*6*numDice)+1;
                let answer;
                if (numDice==1) answer = "It's a "+number;
                else answer = ''+number;
                callback({say: answer});
            });
        },
    },{
        context         : 'main',
        incantation     : '$delayStart [flip|toss] [me] a coin [for me]',
        handler         : function( matchDetails, assistant, callback ) {
            assistant.manager.play('sounds/coinToss.mp3',function(){
                answer = Math.random()>0.5 ? 'heads' : 'tails';
                callback({say: 'It\'s '+answer});
            });
        },
    }
];

module.exports = {
    capabilities: capabilities
}
