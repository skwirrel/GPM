var alarmDescription = false;

var pastAlarms = [];
var futureTimers = [];
var futureAlarms = [];
var goingOff = false;

function timerList( assistant, future ) {
    return assistant.englishJoin(future.map(entry=>assistant.indefiniteArticle(entry.description)+entry.description),';');
}

function cancelTimer( matchDetails, assistant, callback ) {
    let toCancel = false;
    let response = '';
    let newContext = '';
    do {
        if (futureTimers.length==0) {
            response = 'There aren\'t any timers running at the moment';
            break;
        }

        // handle requests to cancel all timers
        if (matchDetails.all) {
            if (futureTimers.length>1) response = 'OK. I\'ve cancelled all the timers that were running';
            else response = 'OK. I\'ve cancelled the timer that was running';
            for( let i=0; i<futureTimers.length; i++ ) {
                clearTimeout( futureTimers[i].timeout );
            }
            futureTimers = [];
            break;
        }
        
        // handle requests to cancel a timer by name
        if (matchDetails.name) {
            let namedTimers = futureTimers.filter(timer=>timer.name.length);
            if (!namedTimers.length) {
                response = 'You don\'t have any named timers running at the moment but you do have: '+timerList( assistant, futureTimers );
                break;
            }
            let match = futureTimers.filter(timer=>timer.name===matchDetails.name);
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
            let sortedTimers = futureTimers.sort( (a,b) => Math.abs(a.duration-matchDetails.timerDuration) - Math.abs(b.duration-matchDetails.timerDuration) );
            toCancel = sortedTimers[0];
            break;
        }
        // handle requests to cancel an unspecified timer
        if (futureTimers.length==1) {
            toCancel = futureTimers[0];
            break;
        }
        // They din't specify which one to cancel, but there are several set - so we need them to clarify
        response = 'You have '+futureTimers.length+' timers running right now: '+timerList( assistant, futureTimers );
        response += '. Which of these would you like to cancel?';
        newContext = 'alarmsAndTimers/whichTimerToCancel';
    } while(false);
    if (toCancel) {
        clearTimeout(toCancel.timeout);
        futureTimers = futureTimers.filter(entry=>entry!=toCancel);
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
            'set a[n] (type:[alarm|timer]) for (timerDuration:$daysDuration) [|from now|time] [[called|for] (name:<stuff>)]',
            'set a (timerDuration:$daysDuration) (type:[timer|alarm]) [[called|for] (name:<stuff>)]',
        ],
        handler         : function( matchDetails, assistant, callback ) {
            let duration = matchDetails.timerDuration;
            let durationWords = assistant.describeDuration(duration);
            durationWords = durationWords.replace(/(day|minute|hour|second)s/g,'$1');
            
            let name = matchDetails.hasOwnProperty('name') ? matchDetails.name : '';

            let description = durationWords+' timer';
            if (name) description += ' called "'+name+'"';

            let now = new Date().getTime();
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
                    futureTimers = futureTimers.filter(entry=>entry!=timerDetails);
                    assistant.manager.enqueueTask('assistant','assistant','sound the alarm');
                    goingOff = timerDetails;
                },duration*1000)
            }
            futureTimers.push(timerDetails);

            return "OK. "+durationWords+" timer started";
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
        incantation     : '[tell me] [which|what] [alarm|timer] [was that|that was]',
        handler         : function( matchDetails, assistant, callback ) {
            let now = new Date().getTime();
            if (!pastAlarms.length || (now - pastAlarms[0].time)>3600000) {
                return 'There hasn\'t been an alarm or timer go off recently';
            }
            return 'that was your '+pastAlarms[0].description;
        },
    },{
        context         : 'main',
        incantations    : [
            '[tell me] [how many] (which:[timer|alarm])s [do I [currently] have|are [there] [currently]|] set [|at th[e|is] moment|[right] now]',
            '[tell me] [are|is] [there] any (which:[timer|alarm])s [currently] set [|at th[e|is] moment|[right] now]'
        ],
        handler         : function( matchDetails, assistant, callback ) {
            let future = matchDetails.which=='alarm' ? futureAlarms:futureTimers;
            
            let response = 'There are '+future.length+' '+matchDetails.which+'s set at the moment';
            
            if (future.length==0) {
                response = 'There aren\'t any '+matchDetails.which+'s set right now';
            } else if (!future.length ==1) {
                response = 'There is only one '+matchDetails.which+' set right now';
            }
            return response;
        },
    },{
        context         : 'main',
        incantation     : '[tell me] [what|which] (which:[timer|alarm])[s] [[do] I [currently] have [set]|have I [currently] [got] [set]|are [there] set] [running] [|at th[e|is] moment|[right] now]',
        handler         : function( matchDetails, assistant, callback ) {
            let future = matchDetails.which=='alarm' ? futureAlarms:futureTimers;
            if (!future.length) {
                return 'You don\'t have any '+matchDetails.which+'s set at the moment';
            }
            if (future.length==1) {
                return 'You have '+assistant.indefiniteArticle(future[0].description)+future[0].description;
            }
            let response = 'You have the following '+matchDetails.which+'s set: ';
            response += assistant.englishJoin(future.map(entry=>assistant.indefiniteArticle(entry.description)+entry.description),';');
            return response;
        },
    },{
        context         : 'main',
        incantations    : [
            '[stop|cancel|abort|delete|clear] [|the|a] [|(name:<stuff>)|(timerDuration:$daysDuration)] timer [[called|for] (name:<stuff>)]',
            '[stop|cancel|abort|delete|clear] (all:all) [of] [the|my] timers'
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
