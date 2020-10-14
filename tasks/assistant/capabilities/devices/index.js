let capabilities = [
    {
        incantations    : [
            '$delayStart [turn|switch] (action:[off|on]) (all:[all]) the (what:<stuff>) $delayStart $autoStop',
            '$delayStart [turn|switch] (all:[all]) the (what:<stuff>) (action:[off|on]) $delayStart $autoStop',
        ],
        handler         : function( matchDetails, assistant, callback ) {
            console.log(matchDetails.what);
            let devices = assistant.manager.devices.find(matchDetails.what);
            if (!devices.length) return 'Sorry - I couldn\'t find any device called "'+matchDetails.what+'"';
            return {
                do: function() {
                    assistant.manager.play( matchDetails.action=='on'?'sounds/bing.mp3':'sounds/bong.mp3' );
                    for( let device of devices ) {        
                        if (matchDetails.action=='on') device.switchOn()
                        else device.switchOff();
                    }
                },
                undo: function() {
                    assistant.manager.play( matchDetails.action=='off'?'sounds/bing.mp3':'sounds/bong.mp3' );
                    for( let device of devices ) {        
                        if (matchDetails.action=='off') device.switchOn()
                        else device.switchOff();
                    }                
                }
            }
        }
    },{
        incantations    : [
            'what [things|devices|plugs|lights] can I [control|switch] [on [and|or] off]',
        ],
        handler         : function( matchDetails, assistant, callback ) {
            let devices = assistant.manager.devices.listNames();
            if (!devices.length) return 'Sorry - I couldn\'t find any devices on the network';
            return 'You can control the following devices: '+assistant.englishJoin( devices,';' );
        }
    }
];

module.exports = {
    capabilities: capabilities
}
