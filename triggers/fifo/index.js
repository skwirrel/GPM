const fs = require('fs');

function fifo( manager ) {
    
    this.fifos = [];
    var self = this;
    
    let fifoDir = __dirname+'/fifos/';
    fs.readdirSync(fifoDir, { withFileTypes: true })
        .filter(dirent => !dirent.isDirectory() && dirent.name.substring(0,1)!='.')
        .forEach(function(dir){
            console.log('Starting handler for FIFO: '+dir.name);
            console.log(fifoDir+dir.name);
            let fifo = fs.createReadStream(fifoDir+dir.name,{flags: fs.constants.O_RDWR});

            var buffer = '';

            fifo.on('data',function(data){
                buffer += data.toString();
                let crPos = buffer.indexOf('\n');
                if (crPos>=0) {
                    line = buffer.substring(0,crPos);
                    buffer = buffer.substring(crPos+1);
                    if (line.length) {
                        console.log('Got line from FIFO: '+line);
                        let[trigger,json] = line.split(':',2);
                        try {
                            if (json.length) json = JSON.parse(json);
                        } catch (e) {
                            console.log('Got invalid JSON: '+json);
                        }
                        manager.trigger(trigger,json);
                    }
                }
            })
            fifo.on('close',function(data){
                console.log('FIFO '+dir.name+' closed - this shouldn\'t happen!');
            });
            
            self.fifos.push(fifo);
    });

}

module.exports = fifo;
