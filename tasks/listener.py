#!/usr/bin/env python3
from __future__ import division

import os 
import re
import sys
import time
import pyaudio
import signal

from google.cloud import speech
from google.cloud.speech import enums
from google.cloud.speech import types
from six.moves import queue

# See http://g.co/cloud/speech/docs/languages
# for a list of supported languages.
language_code = 'en-UK'  # a BCP-47 language tag

# Audio recording parameters
RATE = 16000
CHUNK = int(RATE / 10)  # 100ms
SINK_NAME = 'pulse'
TIMEOUT = 5

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "sttCredentials.json"

# ==============================================
# Support printing to STDERR

def print_error(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)
    sys.stderr.flush()
# ==============================================

# ==============================================
# ALSA Error suppression stuff 
from ctypes import *
from contextlib import contextmanager

ERROR_HANDLER_FUNC = CFUNCTYPE(None, c_char_p, c_int, c_char_p, c_int, c_char_p)

def py_error_handler(filename, line, function, err, fmt):
    pass

c_error_handler = ERROR_HANDLER_FUNC(py_error_handler)

@contextmanager
def noalsaerr():
    asound = cdll.LoadLibrary('libasound.so')
    asound.snd_lib_error_set_handler(c_error_handler)
    yield
    asound.snd_lib_error_set_handler(None)

# ==============================================

with noalsaerr():
    PY_AUDIO = pyaudio.PyAudio()

SINK_ID = 0;
info = PY_AUDIO.get_host_api_info_by_index(0)
numdevices = info.get('deviceCount')
for i in range(0, numdevices):
    if (PY_AUDIO.get_device_info_by_host_api_device_index(0, i).get('maxInputChannels')) > 0:
        # print("Input Device id ", i, " - ", PY_AUDIO.get_device_info_by_host_api_device_index(0, i).get('name'))
        if PY_AUDIO.get_device_info_by_host_api_device_index(0, i).get('name').find(SINK_NAME)==0:
            SINK_ID=i

class MicrophoneStream(object):
    """Opens a recording stream as a generator yielding the audio chunks."""
    def __init__(self, rate, chunk):
        self._rate = rate
        self._chunk = chunk

        # Create a thread-safe buffer of audio data
        self._buff = queue.Queue()
        self.closed = True

    def __enter__(self):
        with noalsaerr():
            self._audio_interface = PY_AUDIO
        return self

    def open(self):
        print_error('opening audio stream');
        self._audio_stream = self._audio_interface.open(
            input_device_index=SINK_ID,
            format=pyaudio.paInt16,
            # The API currently only supports 1-channel (mono) audio
            # https://goo.gl/z757pE
            channels=1, rate=self._rate,
            input=True, frames_per_buffer=self._chunk,
            # Run the audio stream asynchronously to fill the buffer object.
            # This is necessary so that the input device's buffer doesn't
            # overflow while the calling thread makes network requests, etc.
            stream_callback=self._fill_buffer,
        )

        self.closed = False

    def close(self):
        print_error('closing audio stream');
        self._audio_stream.stop_stream()
        self._audio_stream.close()
        self.closed = True
        # Signal the generator to terminate so that the client's
        # streaming_recognize method will not block the process termination.
        self._buff.put(None)

    def __exit__(self, type, value, traceback):
        if not self.closed:
            self.close()
        self._audio_interface.terminate()

    def _fill_buffer(self, in_data, frame_count, time_info, status_flags):
        """Continuously collect data from the audio stream, into the buffer."""
        self._buff.put(in_data)
        return None, pyaudio.paContinue

    def generator(self):
        while not self.closed:
            # Use a blocking get() to ensure there's at least one chunk of
            # data, and stop iteration if the chunk is None, indicating the
            # end of the audio stream.
            chunk = self._buff.get()
            if chunk is None:
                return
            data = [chunk]

            # Now consume whatever other data's still buffered.
            while True:
                try:
                    chunk = self._buff.get(block=False)
                    if chunk is None:
                        return
                    data.append(chunk)
                except queue.Empty:
                    break

            yield b''.join(data)


def listen_print_loop(responses):
    """Iterates through server responses and prints them.

    The responses passed is a generator that will block until a response
    is provided by the server.

    Each response may contain multiple results, and each result may contain
    multiple alternatives; for details, see https://goo.gl/tjCPAU.  Here we
    print only the transcription for the top alternative of the top result.

    """

    startedSpeaking = False
    count=0

    for response in responses:

        count = count + 1
        # print('got response');
        if not response.results:
            # print('empty');
            print_error('End of utterance');
            if response.speech_event_type == enums.StreamingRecognizeResponse.SpeechEventType.END_OF_SINGLE_UTTERANCE:
                # ignore this packet if we have seen partial responses
                # the eventual answer will appear in a subsequent response with result.is_final==True
                if startedSpeaking: continue
                # Cancel the timeout
                signal.alarm(0)
                sys.stdout.write("<NOTHING>\n");
                sys.stdout.flush();
                break
        else:
            # print('not empty');
            startedSpeaking = True;
            # The `results` list is consecutive. For streaming, we only care about
            # the first result being considered, since once it's `is_final`, it
            # moves on to considering the next utterance.
            result = response.results[0]
            if not result.is_final:
                if result.alternatives:
                    print_error('Interim result :'+result.alternatives[0].transcript);
                else:
                    print_error('Interim response (empty)');
                continue

            # print('final');
            if result.alternatives:
                # Cancel the timeout
                signal.alarm(0)

                print_error('Final result');

                # Display the transcription of the top alternative.
                transcript = result.alternatives[0].transcript

                sys.stdout.write(transcript+"\n");
                sys.stdout.flush();
                startedSpeaking = False;

                break

    print_error('Finished response loop')
    return count

def listen():
    global language_code, RATE, enums, types, speech, TIMEOUT

    client = speech.SpeechClient()
    config = types.RecognitionConfig(
        model="command_and_search",
        encoding=enums.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=RATE,
        language_code=language_code)
    streaming_config = types.StreamingRecognitionConfig(
        config=config,
        single_utterance=True,
        interim_results=True)

    numResponses = 1
    atStartup = True

    print_error('STARTED');

    with MicrophoneStream(RATE, CHUNK) as stream:
        while True:
            # Wait for a line of input (i.e. the wake word) before we start listening
            while True:
                start = time.time()
                line = sys.stdin.readline().rstrip()
                elapsed = time.time()-start
                # Ignore any buffered lines i.e. only stop looping when we had to wait for the new line to arrive
                # Except for at startup
                if not atStartup and elapsed<0.2:
                    print_error('Ignoring buffered line')
                else:
                    break

            # If the line of input we got was just "exit" then.... well.... exit!
            if line=='exit':
                return False

            atStartup=False

            stream.open()
            audio_generator = stream.generator()
            requests = (types.StreamingRecognizeRequest(audio_content=content)
                        for content in audio_generator)

            # Set a timeout in case anything goes wrong
            signal.alarm(TIMEOUT)

            responses = client.streaming_recognize(streaming_config, requests)

            # Now, put the transcription responses to use.
            numResponses = listen_print_loop(responses)
            print_error('Got '+str(numResponses)+' responses from Google')


            # Sometimes the Google TTS call fails
            # if the last go failed to get any sort of response from Google then numResponses will be zero
            # In this case just go around again immediately without waiting
            if numResponses==0: return True;

            stream.close()
            return

def timeoutHandler(signum, frame):
    global PY_AUDIO
    print_error("Timed out waiting for response")
    print("<timeout>")
    PY_AUDIO.terminate()
    quit()

def main():
    global PY_AUDIO

    signal.signal(signal.SIGALRM, timeoutHandler)
    listen()
    print_error('Giving up')
    PY_AUDIO.terminate()

if __name__ == '__main__':
    main()
