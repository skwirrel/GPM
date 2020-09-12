#!/usr/bin/env python3
import sys
import struct
import pyaudio
import pvporcupine

SINK_NAME="pulse"

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

porcupine = None
pa = None
audio_stream = None
keywords=["porcupine","americano"]

try:
    porcupine = pvporcupine.create(
        keywords=keywords,
        sensitivities=[1,1])

    with noalsaerr():
        pa = pyaudio.PyAudio()

    info = pa.get_host_api_info_by_index(0)
    numdevices = info.get('deviceCount')
    for i in range(0, numdevices):
        if (pa.get_device_info_by_host_api_device_index(0, i).get('maxInputChannels')) > 0:
            # print("Input Device id ", i, " - ", pa.get_device_info_by_host_api_device_index(0, i).get('name'))
            if pa.get_device_info_by_host_api_device_index(0, i).get('name').find(SINK_NAME)==0:
                SINK_ID=i

    audio_stream = pa.open(
                    input_device_index=SINK_ID,
                    rate=porcupine.sample_rate,
                    channels=1,
                    format=pyaudio.paInt16,
                    input=True,
                    frames_per_buffer=porcupine.frame_length)

    while True:
        pcm = audio_stream.read(porcupine.frame_length)
        pcm = struct.unpack_from("h" * porcupine.frame_length, pcm)

        keyword_index = porcupine.process(pcm)

        if keyword_index >= 0:
            sys.stdout.write(keywords[keyword_index]+"\n");
            sys.stdout.flush();

finally:
    if porcupine is not None:
        porcupine.delete()

    if audio_stream is not None:
        audio_stream.close()

    if pa is not None:
            pa.terminate()
