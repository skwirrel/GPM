const config = require('./configLoader.js')({},process.argv.pop());
console.log(JSON.stringify(config));
