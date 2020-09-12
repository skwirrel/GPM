let capabilities = [
    {
        context         : 'main',
        incantation     : '$please $canYou [[roll|throw|toss] [me]|romy] (number:[[1:a|one|1]|[2:2|two|a pair of]|[3:3|three]|[4:4|four]]) [dice|die] [for me] $please',
        handler         : function( matchDetails, manager, callback ) {
            let numDice = parseInt(matchDetails.number);
            manager.play('sounds/diceRoll.mp3',function(){
                number = Math.floor(Math.random()*6*numDice)+1;
                let answer;
                if (numDice==1) answer = "It's a "+number;
                else answer = number;
                manager.say(answer,true,callback);
            });
        },
    },{
        context         : 'main',
        incantation     : '$please $canYou [flip|toss] [me] a coin [for me] $please',
        handler         : function( matchDetails, manager, callback ) {
            manager.play('sounds/coinToss.mp3',function(){
                answer = Math.random()>0.5 ? 'heads' : 'tails';
                manager.say("It's "+answer,true,callback);
            });
        },
    }
];

module.exports = {
    capabilities: capabilities
}
