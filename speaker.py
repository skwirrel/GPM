#!/usr/bin/env python3
import sys
import hashlib
import os.path
import pathlib
import subprocess
from google.cloud import texttospeech

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "sttCredentials.json"

cacheDir = 'speakerCache'
maxCacheSize = 1048576 * 10 # 10 MB cached text to speech files

def tidyCache( newFile, alreadyInCache ):
    global maxCacheSize
    
    if newFile is not None:
        if alreadyInCache:
            tidyCache.cachedFiles.remove( newFile )
        else:
            tidyCache.cacheSize += os.path.getsize(newFile)
            
        tidyCache.cachedFiles.append( newFile )
        
    while tidyCache.cacheSize > maxCacheSize:
        file = tidyCache.cachedFiles.pop(0)
        tidyCache.cacheSize -= os.path.getsize(file)
        os.remove(os.path.abspath(file))

# Initialize the list of cached files
tidyCache.cachedFiles = [ str(file) for file in sorted(pathlib.Path(cacheDir).iterdir(), key=os.path.getmtime) ]

# Initialize the cache size
tidyCache.cacheSize = sum([ os.path.getsize(file) for file in tidyCache.cachedFiles ]);

def getSpeech( line, cacheFile=None ):
    global ttsClient
    
    # Set the text input to be synthesized
    synthesis_input = texttospeech.SynthesisInput(text=line)

    # Perform the text-to-speech request on the text input with the selected
    # voice parameters and audio file type
    response = getSpeech.ttsClient.synthesize_speech(
        input=synthesis_input,
        voice=getSpeech.voice,
        audio_config=getSpeech.audio_config)

    if cacheFile is not None:
        # print('Writing speech to '+cacheFile);
        # The response's audio_content is binary.
        # Write the response to the cache
        with open(cacheFile, 'wb') as fh:
            fh.write(response.audio_content)
        # Then play the file from cache;
        play( cacheFile );
    else:
        # Open a pipe to play the file directly
        fh = play();
        # Write the response to the pipe
        fh.write(response.audio_content)
        fh.close();

# Instantiate the Google TTS client, voice and encoding
getSpeech.ttsClient = texttospeech.TextToSpeechClient()
getSpeech.voice = texttospeech.VoiceSelectionParams(
        language_code='en-UK',
        ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL)
getSpeech.audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3)

def play( *file ):
    if len(file)==0:
        sox = subprocess.Popen(["play", "-q", "-t", "mp3", "-"], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        return sox.stdin
    else:
        file = file[0];
        sox = subprocess.call(["play", "-q", file],stderr=subprocess.DEVNULL)

while True:
    options,line = (['']+sys.stdin.readline().strip().split(':',1))[-2:]

    if options=='exit': break
    
    line = line.lstrip()

    key = hashlib.md5(line.encode('utf-8')).hexdigest()
    cacheFile = cacheDir + '/' + key + '.mp3'

    if options=='nocache':
        getSpeech( line )
    else:
        if os.path.exists(cacheFile):
            # Use the cached version
            pathlib.Path(cacheFile).touch()
            play(cacheFile)
            tidyCache( cacheFile, True )
        else:
            # Not in the cache so need to generate it
            getSpeech( line, cacheFile )
            # Update and tidy the cache
            tidyCache( cacheFile, False )

    sys.stdout.write("OK\n")
    sys.stdout.flush()
