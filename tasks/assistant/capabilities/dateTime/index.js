let capabilities = [
    {
        context         : 'main',
        incantation     : '$please $canYou [tell me] what[s] [time [it is|is it]|[is ]the time] [now] $please',
        handler         : function( matchDetails, manager, callback ) {
            const date = new Date();
            let hours = date.getHours();
            let minutes = date.getMinutes();
            if (minutes<10) minutes = '0'+minutes;
            if (minutes==45) hours = (hours+1) % 24;

            if (hours==0) hours = 'midnight';
            else if (hours>12) hours -= 12;

            let time;	
            if (minutes==45) time = 'quarter to  '+hours;
            else if (minutes==30) time = 'half past '+hours;
            else if (minutes==15) time = 'quarter past '+hours;
            else if (minutes==0) time = hours + "o'clock";
            else time = hours+' '+minutes;

            let timeIs = Math.random()<0.5 ? "It's":'The time is';
            manager.say(timeIs+' '+time,true,callback);		
        },
    },{
        context         : 'main',
        incantation     : '$please $canYou [tell me] what[s| is] [todays|the] date [today] $please',
        handler         : function( matchDetails, manager, callback ) {
            const d = new Date();
            const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(d);
            const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d);
            const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(d);
            var day = new Intl.DateTimeFormat('en', { day: 'numeric' }).format(d);
            // Add the ordinal
            day += (day > 0 ? ['th', 'st', 'nd', 'rd'][(day > 3 && day < 21) || day % 10 > 3 ? 0 : day % 10] : '');

            manager.say('Today is '+weekday+' the '+day+' of '+month+' '+year,true,callback);		
        },
    }
];

module.exports = {
    capabilities: capabilities
}
