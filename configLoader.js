const fs = require('fs');
const path = require('path');
const homedir = require('os').homedir();
const hjson = require('hjson');

let filename = require.main.filename;

var configLocation;
var mainConfigLocation;

let dir = filename;
let subdir = '';
while (dir.length>1) {
    subdir = path.basename(dir)+'/'+subdir;
    dir = path.dirname(dir);
    let lookingFor = dir+'/config';
    if (fs.existsSync(lookingFor) && fs.lstatSync(lookingFor).isDirectory()) {
        mainConfigLocation = lookingFor+'/main.json';
        configLocation = lookingFor+'/'+subdir;
        configLocation = configLocation.replace(/\.js\/$/,'.json');
        break;
    }
}

function mergeDeep(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

var config = mergeDeep(
    fs.existsSync(mainConfigLocation) ? hjson.parse(fs.readFileSync(mainConfigLocation, 'utf-8')) : {},
    fs.existsSync(configLocation) ? hjson.parse(fs.readFileSync(configLocation, 'utf-8')) : {},
);

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function configSubstitution( notUsed, key ) {
    let data = config;
    key=key.replace(/\[(.*?)\]/g,'.$1');
    key=key.split('.');
    while( key.length ) {
        let nextKey = key.shift();
        if (typeof(data[nextKey])=='undefined') return '';
        data = data[nextKey];
    }
    return data;
}

let configInterpolationRegex = /<<(.*?)>>/g;
let isDiretoryConfiguration = /(dir|directory)$/i;

function interpolateConfig(config) {
    for (let key in config) {
        key = key.toString();
        let newKey = key.replace(configInterpolationRegex,configSubstitution);
        if ( typeof(config[key]) == 'object' || typeof(config[key]) == 'array' ) {
            config[newKey] = config[key];
            interpolateConfig( config[key] );
        } else {
            config[newKey] = config[key].toString().replace(configInterpolationRegex,configSubstitution);
            if (newKey.match(isDiretoryConfiguration) && config[newKey].substring(0,1)=='~') {
                config[newKey] = homedir+config[newKey].substring(1);
            }
        }
        if (newKey !== key) delete config[key];
        // Support for ~ => home directory in any parameters that end "Directory" or "Dir"
    }
}

interpolateConfig(config);

module.exports = function(defaults){
    interpolateConfig(defaults);
    return mergeDeep(defaults,config);
}
