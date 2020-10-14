const net = require('net');
const tpLink = require('tplink-smarthome-api');

var suppressErrors = true;

const tpLinkClient = new tpLink.Client({logLevel:'error',logger:{error:function(notUsed,error){if (suppressErrors) return; console.error(error.toString())}}});

var decives = [];
var registerDeviceCallback;

// attempt to connecto to all devices on the network so that they are all in the arp table
for( let i=0; i<255; i++ ) {
    let connection = net.createConnection(9999,'172.16.0.'+i);
    connection.setTimeout(1000, () => connection.destroy());
    connection.on('connect',function(){connection.destroy()});
    connection.on('error',function(error){connection.destroy()});
}

// wait for the connections to succeed/fail
setTimeout(function(){

    Promise.all(
        // Now get a list of neighbours from the arp table
        require('child_process')
        .execSync('ip neighbour')
        .toString()
        .split('\n')
        // Only the reachable ones
        .filter(line=>line.match(/(STALE|REACHABLE|DELAY)$/))
        // with IPv4 addresses
        .map(line=>(line.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/) || [''])[0])
        // Now try to connect to each one as if it were a TPLink device and see if we get a valid response
        .map(function(ip){
            if (!ip.length) return Promise.resolve(false);
            // see if this is a TPLink device
            return tpLinkClient.getDevice({host:ip}).then(function(device) {
                console.log('Found TP Link '+tpLinkClient.getTypeFromSysInfo(device.sysInfo)+' device: '+device.alias);
                registerDeviceCallback( new tpLinkDevice(device), device.alias );
                // device.getPowerState().then(function(state){
                // });
            })
            .catch( function(error) {
                if (!(error.code=='ECONNREFUSED' || error.toString().match('TCP Timeout') )) console.log(error.code+': '+error.toString());
            });
        })
    ).then(function(){
        suppressErrors=false;
        console.log('Finished looking for TP Link devices');
    });
},2000);

function tpLinkDevice( device ) {
    this.device = device;
}

tpLinkDevice.prototype.getStatus = function(callback) {
    this.device.getPowerState().then(function(state){
        callback({
            power: state?'on':'off'
        })
    });
}

tpLinkDevice.prototype.switchOn = function(callback) {
    if (typeof(callback)=='function') {
        // First get the current state so that we can let the callback know if something actually changed
        this.device.getStatus(function(status){
            if (status.power=='on') return callback(false);
            this.device.setPowerState(true);
            callback(true);
        });
    } else this.device.setPowerState(true);
}

tpLinkDevice.prototype.switchOff = function(callback) {
    if (typeof(callback)=='function') {
        // First get the current state so that we can let the callback know if something actually changed
        this.device.getStatus(function(status){
            if (status.power=='off') return callback(false);
            this.device.setPowerState(false);
            callback(true);
        });
    } else this.device.setPowerState(false);
}

module.exports = {
    passRegisterCallback: function(callback){ registerDeviceCallback = callback; }
}
