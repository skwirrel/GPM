const fs = require('fs');
const path = require('path');
const homedir = require('os').homedir();
const hjson = require('hjson');

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

function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

var config;

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
let isDiretoryConfiguration = /(dir|directory|file|filename)$/i;

function interpolateConfig(config) {
    // First go through and resolve home directories
    for (let key in config) {
        // Support for ~ => home directory in any parameters that end "Directory", "Dir", "File" or "filename"
        if (key.match(isDiretoryConfiguration) && config[key].substring(0,1)=='~') {
            config[key] = homedir+config[key].substring(1);
        }
    }
    
    // Now substitute any parameter references
    for (let key in config) {
        key = key.toString();
        let newKey = key.replace(configInterpolationRegex,configSubstitution);
        if ( typeof(config[key]) == 'object' || typeof(config[key]) == 'array' ) {
            config[newKey] = config[key];
            interpolateConfig( config[key] );
        } else {
            config[newKey] = config[key].toString().replace(configInterpolationRegex,configSubstitution);
        }
        if (newKey !== key) delete config[key];
    }
}

module.exports = function(defaults,location){

    let configLocation;
    let mainConfigLocation;
    let personalConfigLocation;
    
    personalConfigLocation = homedir + '/.GPM/config.json';
    
    let dir = location || require.main.filename;
    let subdir = '';
    // Find the locations of the relevant config files
    while (dir.length>1) {
        subdir = path.basename(dir)+'/'+subdir;
        dir = path.dirname(dir);
        let lookingFor = dir+'/config';
        if (fs.existsSync(lookingFor) && fs.lstatSync(lookingFor).isDirectory()) {
            mainConfigLocation = lookingFor+'/main.json';
            configLocation = lookingFor+'/'+subdir;
            configLocation = configLocation.replace(/\.(js|py)\/$/,'.json');
            // if the file we are looking for is "index.json" but this doesn't exist then look for <directory>.json instead
            if (configLocation.match(/\/index\.json$/) && !fs.existsSync(configLocation)) {
                configLocation = configLocation.replace(/\/index\.json$/,'.json');
            }
            break;
        }
    }
    config = mergeDeep(
        defaults,
        fs.existsSync(mainConfigLocation) ? hjson.parse(fs.readFileSync(mainConfigLocation, 'utf-8')) : {},
        fs.existsSync(configLocation) ? hjson.parse(fs.readFileSync(configLocation, 'utf-8')) : {},
        fs.existsSync(personalConfigLocation) ? hjson.parse(fs.readFileSync(personalConfigLocation, 'utf-8')) : {},
    );

    // Add lt and gt to the config so that these can be used if we ever need to actually have << or >> in config keys/values
    // With these in place we can use <<lt>> for "<<" or <<gt>> for ">>"
    config.lt = '<<';
    config.gt = '<<';

    interpolateConfig(config);
    
    return config;
}
