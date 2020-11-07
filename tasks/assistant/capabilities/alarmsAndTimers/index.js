var alarmDescription = false;

var pastAlarms = [];
var future = {
    timers : [],
    alarms : []
};
var goingOff = false;

function timerList( assistant, future ) {
    return assistant.englishJoin(future.map(entry=>assistant.indefiniteArticle(entry.description)+entry.description),';');
}

function cancelTimer( matchDetails, assistant, callback ) {
    let toCancel = false;
    let response = '';
    let newContext = '';
    do {
        if (future.timers.length==0) {
            response = 'There aren\'t any timers running at the moment';
            break;
        }

        // handle requests to cancel all timers
        if (matchDetails.all) {
            if (future.timers.length>1) response = 'OK. I\'ve cancelled all the timers that were running';
            else response = 'OK. I\'ve cancelled the timer that was running';
            for( let i=0; i<future.timers.length; i++ ) {
                clearTimeout( future.timers[i].timeout );
            }
            future.timers = [];
            break;
        }
        
        // handle requests to cancel a timer by name
        if (matchDetails.name) {
            let namedTimers = future.timers.filter(timer=>timer.name.length);
            if (!namedTimers.length) {
                response = 'You don\'t have any named timers running at the moment but you do have: '+timerList( assistant, future.timers );
                break;
            }
            let match = future.timers.filter(timer=>timer.name===matchDetails.name);
            if (match.length) {
                toCancel=match[0];
                break;
            }
            response = 'You don\'t have a timer called "'+matchDetails.name+'" running at the moment. '
            if ( namedTimers.length==1 ) response += 'The only named timer running right now is one called "'+namedTimers[0].name+'"';
            else response += 'The named timers you have running at the moment are: '+assistant.englishJoin( namedTimers.map(timer=>'one called "'+timer.name+'"'),';' );
            break;
        }
        // handle requests to cancel a timer duration
        // This doesn't require an exact match - it just picks the one with the closest duration
        if (matchDetails.timerDuration) {
            let sortedTimers = future.timers.sort( (a,b) => Math.abs(a.duration-matchDetails.timerDuration) - Math.abs(b.duration-matchDetails.timerDuration) );
            toCancel = sortedTimers[0];
            break;
        }
        // handle requests to cancel an unspecified timer
        if (future.timers.length==1) {
            toCancel = future.timers[0];
            break;
        }
        // They din't specify which one to cancel, but there are several set - so we need them to clarify
        response = 'You have '+future.timers.length+' timers running right now: '+timerList( assistant, future.timers );
        response += '. Which of these would you like to cancel?';
        newContext = 'alarmsAndTimers/whichTimerToCancel';
    } while(false);
    if (toCancel) {
        clearTimeout(toCancel.timeout);
        future.timers = future.timers.filter(entry=>entry!=toCancel);
        response = 'OK. I\'ve cancelled your '+toCancel.description;
    }
    return {
        say:        response,
        newContext: newContext,
        contextHandlesStop: newContext.length
    }
}

let capabilities = [
    {
        context         : 'main',
        incantations    : [
            'set a[|n|nother] (type:[alarm|timer]) for (timerDuration:$daysDuration) [|from now|time] [[called|for] (name:<stuff>)]',
            'set a (timerDuration:$daysDuration) (type:[timer|alarm]) [[called|for] (name:<stuff>)]',
            'set an[other] (type:alarm) for (alarmTime:$timeOfDay) [[called|for] (name:<stuff>)]',
        ],
        handler         : function( matchDetails, assistant, callback ) {
            let duration, description, response;
            let now = new Date().getTime();
            
            if (matchDetails.type=='timer') {
                duration = matchDetails.timerDuration;
                description = assistant.describeDuration(duration,-1)+' timer';
                
                response = 'OK. '+description+' started';
            } else {
                if (matchDetails.hasOwnProperty('alarmTime')) duration = matchDetails.alarmTime - now/1000;
                else duration = matchDetails.timerDuration;
                console.log(matchDetails.alarmTime);
                description = assistant.describeTime( now + duration*1000 )+' alarm';
                response = 'OK. Alarm set for '+assistant.describeTime( now + duration*1000 );
            }
            
            let name = matchDetails.hasOwnProperty('name') ? matchDetails.name : '';

            if (name) description += ' called "'+name+'"';

            let timerDetails = {
                time        : now + duration*1000,
                createTime  : now,
                description : description,
                name        : name,
                duration    : duration,
                timeout     : setTimeout(function(){
                    pastAlarms.unshift(timerDetails);
                    // keep the list of past alarms down to the last 10
                    if (pastAlarms.length>10) pastAlarms.pop();
                    future[matchDetails.type+'s'] = future[matchDetails.type+'s'].filter(entry=>entry!=timerDetails);
                    assistant.manager.enqueueTask('assistant',false,'assistant','sound the alarm');
                    goingOff = timerDetails;
                },duration*1000)
            }
            future[matchDetails.type+'s'].push(timerDetails);

            return response;
        },
    },{
        context         : 'main',
        incantation     : 'sound the alarm',
        handler         : function( matchDetails, assistant, callback ) {
            var stopAlarm;
            assistant.manager.say("This is your "+goingOff.description,true,function(){
                stopAlarm = assistant.manager.play('sounds/ding.mp3',false,20);
            });
            assistant.onNextWake(function(callback){
                console.log('Stopping alarm');
                stopAlarm();
                callback();
            });
            return {};
        },
    },{
        context         : 'main',
        incantation     : '[tell me] [which|what] [|alarm|timer] [was that|that was] [|alarm|timer] [for]',
        handler         : function( matchDetails, assistant, callback ) {
            let now = new Date().getTime();
            if (!pastAlarms.length || (now - pastAlarms[0].time)>3600000) {
                return 'There hasn\'t been an alarm or timer go off recently';
            }
            return 'that was your '+pastAlarms[0].description;
        },
    },{
        context         : 'main',
        // Google seems to often here "time is" instead of "timers"
        // so listen out for this as well
        incantations    : [
            '[tell me] [how many] (which:[time is|timers|alarms]) [do I [currently] have|are [there] [currently]|] set [|at th[e|is] moment|[right] now]',
            '[tell me] [are|is] [there] any (which:[time is|timer|alarm])s [currently] set [|at th[e|is] moment|[right] now]'
        ],
        handler         : function( matchDetails, assistant, callback ) {
            let which = matchDetails.which;
            if (which=='time is') which='timers';
            which = which.replace(/s$/,'');

            let things = future[which+'s'];
            
            let response = 'There are '+things.length+' '+which+'s set at the moment';
            
            if (things.length==0) {
                response = 'There aren\'t any '+which+'s set right now';
            } else if (!things.length ==1) {
                response = 'There is only one '+which+' set right now';
            }
            return response;
        },
    },{
        context         : 'main',
        incantation     : '[tell me] [what|which] (which:[time is|timer|alarm])[s] [[do] I [currently] have [set]|have I [currently] [got] [set]|are [there] set] [running] [|at th[e|is] moment|[right] now]',
        handler         : function( matchDetails, assistant, callback ) {
            let which = matchDetails.which;
            if (which=='time is') which='timers';
            which = which.replace(/s$/,'');

            let things = future[which+'s'];
            if (!things.length) {
                return 'You don\'t have any '+which+'s set at the moment';
            }
            if (things.length==1) {
                return 'You have '+assistant.indefiniteArticle(things[0].description)+things[0].description;
            }
            let response = 'You have the following '+which+'s set: ';
            response += assistant.englishJoin(things.map(entry=>assistant.indefiniteArticle(entry.description)+entry.description),';');
            return response;
        },
    },{
        context         : 'main',
        incantations    : [
            '[stop|cancel|abort|delete|clear] [|the|a] [|(name:<stuff>)|(timerDuration:$daysDuration)] timer [[called|for] (name:<stuff>)]',
            '[stop|cancel|abort|delete|clear] (all:all) [of] [the|my] [timers|time is]'
        ],
        handler         : cancelTimer,
    },{
        context         : 'alarmsAndTimers/whichTimerToCancel',
        incantations    : [
            '[|stop|cancel|abort|delete|clear] the [(timerDuration:$daysDuration)] [one|timer|alarm]',
            '[|stop|cancel|abort|delete|clear] the (name:<stuff>) [one|timer|alarm]',
            '[|stop|cancel|abort|delete|clear] the [one|timer|alarm] [called|for] (name:<stuff>)',
            '[|stop|cancel|abort|delete|clear] (all:all) [|timers|of them]',
            '(cancel:[|sorry|ok] [timeout|stop|dont worry|forget it|stop|cancel|ignore me])',
            '(name:<stuff>)',
        ],
        handler         : function( matchDetails, assistant, callback ) {
            if (matchDetails.cancel) return 'OK. I\'ve left all your timers as they were';
            return cancelTimer( matchDetails, assistant, callback );
        }
    }
];

module.exports = {
    capabilities: capabilities
}
