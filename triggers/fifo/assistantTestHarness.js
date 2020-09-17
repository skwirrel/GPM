const repl = require('repl');
const fs = require('fs');

let fifoName = process.argv.pop();

if (!fs.existsSync(fifoName)) {
    console.error(fifoName+' not found');
    process.exit();
}

let stats = fs.statSync(fifoName);

if (!stats.isFIFO()) {
    console.error(fifoName+' is not a FIFO');
    process.exit();
}

var fifo = fs.createWriteStream(fifoName);

function myEval(cmd, context, filename, callback) {
    cmd = cmd.trim();
    if (cmd=='exit' || cmd=='quit') process.exit();
    fifo.write('Assistant:'+JSON.stringify(cmd.split('|'))+'\n');
    callback(null, 'OK');
}

repl.start({ prompt: '> ', eval: myEval });
