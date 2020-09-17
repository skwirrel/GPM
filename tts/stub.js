const readline = require('readline');

// A simple null TTS engine
// Doesn't actually do any TTS - but behaves like the TTS engine should
const reader = readline.createInterface({
  input: process.stdin,
  output: null,
  terminal: false,
});

reader.on('line', function(line){
    console.log('OK');
});

